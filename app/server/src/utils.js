import fs from "node:fs/promises";
import path from "node:path";

export function compact(value) {
  return value == null || value === "" ? "" : String(value).trim();
}

export function safeFilePart(value, fallback = "untitled") {
  const cleaned = compact(value)
    .normalize("NFKD")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

export function displayTitle(value) {
  return compact(value)
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function creatorsToText(creators = []) {
  return creators
    .map((creator) => {
      if (creator.name) return creator.name;
      return [creator.firstName, creator.lastName].filter(Boolean).join(" ");
    })
    .filter(Boolean)
    .join("; ");
}

export function firstYear(dateValue) {
  const match = String(dateValue || "").match(/\d{4}/);
  return match ? match[0] : "unknown-year";
}

export function itemToPaper(item) {
  const data = item.data || item;
  return {
    key: item.key || data.key,
    version: item.version || data.version,
    title: data.title || "Untitled",
    displayTitle: displayTitle(data.title || "Untitled"),
    authors: creatorsToText(data.creators || []),
    year: firstYear(data.date),
    date: data.date || "",
    venue:
      data.publicationTitle ||
      data.conferenceName ||
      data.proceedingsTitle ||
      data.publisher ||
      "",
    doi: data.DOI || "",
    abstractNote: data.abstractNote || "",
    url: data.url || "",
    itemType: data.itemType || "",
    tags: (data.tags || []).map((tag) => tag.tag).filter(Boolean),
    collections: data.collections || [],
    raw: data
  };
}

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}


