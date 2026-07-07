import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { ensureDir } from "./utils.js";

function indexPath() {
  return path.join(config.paths.metadataRoot, "local-pdfs.json");
}

async function readIndex() {
  try {
    const content = await fs.readFile(indexPath(), "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeIndex(index) {
  const target = indexPath();
  await ensureDir(path.dirname(target));
  await fs.writeFile(target, JSON.stringify(index, null, 2), "utf8");
}

async function fileExists(filePath) {
  if (!filePath) return false;
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

export async function recordLocalPdf({ paperKey, pdfPath, source }) {
  if (!paperKey || !pdfPath) return null;
  const index = await readIndex();
  index[paperKey] = {
    pdfPath,
    source: source || "unknown",
    recordedAt: new Date().toISOString()
  };
  await writeIndex(index);
  return index[paperKey];
}

export async function getIndexedLocalPdfPath(paperKey) {
  if (!paperKey) return null;
  const index = await readIndex();
  const entry = index[paperKey];
  if (!entry?.pdfPath) return null;
  if (!(await fileExists(entry.pdfPath))) return null;
  return entry.pdfPath;
}
