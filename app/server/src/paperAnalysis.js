import fs from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { config } from "./config.js";
import { ensureDir, safeFilePart } from "./utils.js";
import { getLocalPdfPath } from "./zotero.js";
import { getIndexedLocalPdfPath } from "./localPdfIndex.js";

const PAGE_TEXT_LIMIT = 6000;
const NEARBY_TEXT_LIMIT = 1800;
const TABLE_TEXT_LIMIT = 5000;
const DEFAULT_MAX_VISUALS = 20;
const VISUAL_CODE_RE = /\b(?:Fig(?:ure)?\.?\s*\d+[A-Za-z]?(?:\s*\([a-z]\))?|Table\s*\d+[A-Za-z]?|[\u56fe\u8868]\s*\d+)/gi;
const TEXT_TOO_SHORT_WARNING = "\u6587\u672c\u63d0\u53d6\u4e0d\u8db3\uff0c\u53ef\u80fd\u9700\u8981 OCR\u3002";
const UNCODED_VISUAL_WARNING = "\u56fe\u8868\u7f16\u7801\u672a\u8bc6\u522b";

async function fileExists(filePath) {
  if (!filePath) return false;
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

function cleanText(value) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clip(value, limit) {
  const text = cleanText(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n...[truncated]`;
}

function normalizeVisualCode(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^Figure\s*/i, "Fig. ")
    .replace(/^Fig\s+(\d)/i, "Fig. $1")
    .replace(/^Table\s+(\d)/i, "Table $1")
    .trim();
}

function visualType(code) {
  if (/^(Table|\u8868)/i.test(code)) return "table";
  return "figure";
}

function slugForVisual(code, pageNumber) {
  const base = safeFilePart(code || `page-${pageNumber}`, `page-${pageNumber}`)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || `page-${pageNumber}`}-page-${String(pageNumber).padStart(3, "0")}.png`;
}

function baseFigureCode(code) {
  const match = String(code || "").match(/^(Fig\.?|Figure)\s*(\d+)[A-Za-z]$/i);
  if (!match) return "";
  return "Fig. " + match[2];
}

function captionAroundCode(pageText, code) {
  const lines = cleanText(pageText).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exact = new RegExp(escaped, "i");
  const line = lines.find((entry) => exact.test(entry)) || "";
  if (line) return clip(line, 900);

  const index = pageText.toLowerCase().indexOf(code.toLowerCase());
  if (index < 0) return "";
  return clip(pageText.slice(Math.max(0, index - 450), index + 900), 1200);
}

function nearbyTextForPage(pageText) {
  return clip(pageText, NEARBY_TEXT_LIMIT);
}

function extractVisualCandidates(pageTextDigest, maxVisuals) {
  const seen = new Set();
  const candidates = [];

  for (const page of pageTextDigest) {
    const text = page.text || "";
    const matches = Array.from(text.matchAll(VISUAL_CODE_RE));
    for (const match of matches) {
      const code = normalizeVisualCode(match[0]);
      const key = `${code.toLowerCase()}-${page.page}`;
      if (!code || seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        code,
        type: visualType(code),
        page: page.page,
        caption: captionAroundCode(text, code),
        nearbyText: nearbyTextForPage(text)
      });
      if (candidates.length >= maxVisuals) return candidates;
    }
  }

  return candidates;
}

async function extractPageText(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return {
      total: result.total || result.pages?.length || 0,
      pages: (result.pages || []).map((page) => ({
        page: page.num,
        text: cleanText(page.text || "")
      }))
    };
  } finally {
    await parser.destroy();
  }
}

async function extractTables(buffer, visuals) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getTable();
    const tableVisuals = visuals.filter((visual) => visual.type === "table");
    const tables = [];

    for (const page of result.pages || []) {
      const pageTables = page.tables || [];
      pageTables.forEach((table) => {
        const visual = tableVisuals.find((entry) => entry.page === page.num);
        tables.push({
          code: visual?.code || "",
          caption: visual?.caption || "",
          extractedText: clip(
            table.map((row) => row.map((cell) => cleanText(cell)).join("\t")).join("\n"),
            TABLE_TEXT_LIMIT
          ),
          relativeImagePath: visual?.relativeImagePath || ""
        });
      });
    }

    return tables;
  } catch {
    return [];
  } finally {
    await parser.destroy();
  }
}

async function renderVisualPages({ buffer, paperKey, visuals, warnings }) {
  if (!visuals.length) return visuals;
  const uniquePages = Array.from(new Set(visuals.map((visual) => visual.page))).sort((a, b) => a - b);
  const assetDir = path.join(config.paths.notesRoot, "_assets", paperKey);
  await ensureDir(assetDir);

  const parser = new PDFParse({ data: buffer });
  try {
    const screenshots = await parser.getScreenshot({
      partial: uniquePages,
      desiredWidth: 1200,
      imageBuffer: true,
      imageDataUrl: false
    });
    const screenshotByPage = new Map((screenshots.pages || []).map((page) => [page.pageNumber, page]));

    for (const visual of visuals) {
      const screenshot = screenshotByPage.get(visual.page);
      if (!screenshot?.data) continue;
      const filename = slugForVisual(visual.code, visual.page);
      const assetPath = path.join(assetDir, filename);
      await fs.writeFile(assetPath, Buffer.from(screenshot.data));
      const baseCode = baseFigureCode(visual.code);
      if (baseCode) {
        const aliasPath = path.join(assetDir, slugForVisual(baseCode, visual.page));
        if (!(await fileExists(aliasPath))) {
          await fs.copyFile(assetPath, aliasPath);
        }
      }
      visual.assetPath = assetPath;
      visual.relativeImagePath = `../_assets/${paperKey}/${filename}`;
    }
  } catch (error) {
    warnings.push(`\u56fe\u8868\u9875\u622a\u56fe\u751f\u6210\u5931\u8d25\uff1a${error.message}`);
  } finally {
    await parser.destroy();
  }

  return visuals;
}

async function resolvePdfPath(paper) {
  const localApiPath = await getLocalPdfPath(paper.key).catch(() => null);
  if (await fileExists(localApiPath)) {
    return { pdfPath: localApiPath, source: "zotero-local-api" };
  }

  const indexedPath = await getIndexedLocalPdfPath(paper.key).catch(() => null);
  if (await fileExists(indexedPath)) {
    return { pdfPath: indexedPath, source: "local-index" };
  }

  return { pdfPath: null, source: "missing" };
}

export async function preparePaperAnalysisInput({ paper, maxFigures = DEFAULT_MAX_VISUALS }) {
  const warnings = [];
  const { pdfPath, source } = await resolvePdfPath(paper);
  if (!pdfPath) {
    throw new Error("No local PDF was found for this Zotero item. Open Zotero Desktop or import the PDF through this app first.");
  }

  const buffer = await fs.readFile(pdfPath);
  const textResult = await extractPageText(buffer);
  const pageTextDigest = textResult.pages.map((page) => ({
    page: page.page,
    text: clip(page.text, PAGE_TEXT_LIMIT)
  }));
  const totalCharacters = textResult.pages.reduce((sum, page) => sum + (page.text?.length || 0), 0);

  if (totalCharacters < 2000) {
    warnings.push(TEXT_TOO_SHORT_WARNING);
  }

  const visuals = extractVisualCandidates(pageTextDigest, Math.max(0, Number(maxFigures) || DEFAULT_MAX_VISUALS));
  await renderVisualPages({ buffer, paperKey: paper.key, visuals, warnings });
  const tables = await extractTables(buffer, visuals);

  const uncodedImages = visuals.filter((visual) => !visual.code).length;
  if (uncodedImages > 0) {
    warnings.push(`${UNCODED_VISUAL_WARNING}\uff1a${uncodedImages} \u4e2a\u5019\u9009\u56fe\u50cf\u3002`);
  }

  return {
    input: {
      metadata: {
        title: paper.title || "",
        authors: paper.authors || "",
        year: paper.year || "",
        venue: paper.venue || "",
        doi: paper.doi || "",
        zoteroKey: paper.key || "",
        abstract: paper.abstractNote || ""
      },
      pageTextDigest,
      visuals: visuals.map((visual) => ({
        code: visual.code,
        type: visual.type,
        caption: visual.caption,
        relativeImagePath: visual.relativeImagePath || "",
        nearbyText: visual.nearbyText
      })),
      tables
    },
    assets: visuals
      .filter((visual) => visual.relativeImagePath)
      .map((visual) => ({
        code: visual.code,
        type: visual.type,
        path: visual.assetPath,
        relativeImagePath: visual.relativeImagePath
      })),
    warnings,
    textStats: {
      pages: textResult.total,
      characters: totalCharacters,
      pdfSource: source
    }
  };
}
