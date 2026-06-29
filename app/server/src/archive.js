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

  const content = noteBody?.trim() ? noteBody : frontMatter;
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

