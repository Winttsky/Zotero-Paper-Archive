import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import {
  ensureDir,
  firstYear,
  safeFilePart,
  writeJson,
  creatorsToText
} from "./utils.js";
import { getLocalPdfPath } from "./zotero.js";

async function renderTemplate(values) {
  let template = await fs.readFile(config.paths.template, "utf8");
  for (const [key, value] of Object.entries(values)) {
    template = template.replaceAll(`{{${key}}}`, value == null ? "" : String(value));
  }
  return template;
}

function archiveStem(paper) {
  return [
    firstYear(paper.raw?.date || paper.date || paper.year),
    safeFilePart(paper.title),
    paper.key
  ].join("-");
}

function isLocalAssetHref(href) {
  return /(^|\/)_assets\//.test(String(href || "").replace(/\\/g, "/"));
}

function resolveMarkdownHref(noteFilePath, href) {
  const withoutAnchor = String(href || "").split("#")[0].split("?")[0];
  try {
    return path.resolve(path.dirname(noteFilePath), decodeURIComponent(withoutAnchor));
  } catch {
    return path.resolve(path.dirname(noteFilePath), withoutAnchor);
  }
}

async function localAssetExists(noteFilePath, href) {
  if (!isLocalAssetHref(href)) return true;
  try {
    const stats = await fs.stat(resolveMarkdownHref(noteFilePath, href));
    return stats.isFile();
  } catch {
    return false;
  }
}

async function normalizeMarkdownAssetLinks(markdown, noteFilePath) {
  let content = String(markdown || "");

  for (const match of Array.from(content.matchAll(/!\[([^\]\n]*)\]\(([^)\n]+)\)/g))) {
    const [raw, label, href] = match;
    if (!isLocalAssetHref(href)) continue;
    if (await localAssetExists(noteFilePath, href)) continue;
    content = content.split(raw).join((label || href) + "(\u56fe\u50cf\u6587\u4ef6\u7f3a\u5931\uff1a" + href + ")");
  }

  for (const match of Array.from(content.matchAll(/(^|[^!])\[([^\]\n]+)\]\(([^)\n]+)\)/g))) {
    const [raw, prefix, label, href] = match;
    if (!isLocalAssetHref(href)) continue;
    const exists = await localAssetExists(noteFilePath, href);
    const replacement = exists
      ? prefix + "![" + label + "](" + href + ")"
      : prefix + label + "(\u56fe\u50cf\u6587\u4ef6\u7f3a\u5931\uff1a" + href + ")";
    content = content.split(raw).join(replacement);
  }

  return content;
}

export async function saveReadingNote({ paper, domainName, noteBody }) {
  const dir = path.join(config.paths.notesRoot, safeFilePart(domainName, "domain"));
  const filePath = path.join(dir, `${archiveStem(paper)}.md`);
  await ensureDir(dir);

  const frontMatter = await renderTemplate({
    title: paper.title,
    authors: paper.authors || creatorsToText(paper.raw?.creators || []),
    year: paper.year,
    venue: paper.venue,
    doi: paper.doi,
    zoteroKey: paper.key,
    domain: domainName,
    archivedAt: new Date().toISOString()
  });

  const content = await normalizeMarkdownAssetLinks(
    noteBody?.trim() ? noteBody : frontMatter,
    filePath
  );
  await fs.writeFile(filePath, content, "utf8");
  return filePath;
}

export async function copyPdfIfAvailable({ paper, domainName }) {
  try {
    const sourcePath = await getLocalPdfPath(paper.key);
    if (!sourcePath) {
      return { copied: false, reason: "No local Zotero PDF path was available." };
    }

    const targetDir = path.join(
      config.paths.papersRoot,
      safeFilePart(domainName, "domain")
    );
    const targetPath = path.join(targetDir, `${archiveStem(paper)}.pdf`);
    await ensureDir(targetDir);
    await fs.copyFile(sourcePath, targetPath);
    return { copied: true, sourcePath, targetPath };
  } catch (error) {
    return { copied: false, reason: error.message };
  }
}

export async function saveArchiveMetadata({ before, after, domainName, notePath, pdf }) {
  const itemsDir = path.join(config.paths.metadataRoot, "items");
  const snapshotPath = path.join(itemsDir, `${before.key}.json`);
  const logPath = path.join(config.paths.metadataRoot, "archive-log.jsonl");
  const entry = {
    archivedAt: new Date().toISOString(),
    zoteroKey: before.key,
    title: before.title,
    domainName,
    notePath,
    pdf,
    before,
    after
  };

  await writeJson(snapshotPath, entry);
  await ensureDir(path.dirname(logPath));
  await fs.appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
  return { snapshotPath, logPath };
}

export async function getArchiveMetadataForPaper(paperKey) {
  if (!paperKey) return null;

  const snapshotPath = path.join(config.paths.metadataRoot, "items", String(paperKey) + ".json");
  try {
    const raw = await fs.readFile(snapshotPath, "utf8");
    const entry = JSON.parse(raw);
    return {
      notePath: entry.notePath || "",
      archivedDomainName: entry.domainName || "",
      archivedAt: entry.archivedAt || "",
      pdf: entry.pdf || null
    };
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("Failed to read archive metadata for " + paperKey + ": " + error.message);
    }
    return null;
  }
}

export async function attachArchiveMetadata(papers = []) {
  return Promise.all(
    papers.map(async (paper) => {
      const archive = await getArchiveMetadataForPaper(paper.key);
      if (!archive) return paper;
      return {
        ...paper,
        notePath: archive.notePath,
        archivedDomainName: archive.archivedDomainName,
        archivedAt: archive.archivedAt,
        archivedPdf: archive.pdf
      };
    })
  );
}

