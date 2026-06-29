import { PDFParse } from "pdf-parse";
import { safeFilePart } from "./utils.js";

function displayTitleFromFilename(filename) {
  return safeFilePart(filename.replace(/\.pdf$/i, ""), "Untitled PDF")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDoi(text) {
  const match = text.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  if (!match) return "";
  return match[0].replace(/[\s.;,)]*$/g, "");
}

function creatorsFromCrossref(authorList = []) {
  return authorList.slice(0, 30).map((author) => ({
    creatorType: "author",
    firstName: author.given || "",
    lastName: author.family || author.name || ""
  })).filter((author) => author.firstName || author.lastName);
}

function yearFromCrossref(message) {
  const parts =
    message?.published?.["date-parts"]?.[0] ||
    message?.publishedPrint?.["date-parts"]?.[0] ||
    message?.publishedOnline?.["date-parts"]?.[0] ||
    message?.issued?.["date-parts"]?.[0] ||
    [];
  return parts[0] ? String(parts[0]) : "";
}

async function fetchCrossrefByDoi(doi) {
  if (!doi) return null;
  const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
    headers: {
      "User-Agent": "Zotero-Paper-Archive/0.1 (local app)"
    }
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const message = payload.message;
  if (!message) return null;

  return {
    title: message.title?.[0] || "",
    creators: creatorsFromCrossref(message.author || []),
    publicationTitle: message["container-title"]?.[0] || "",
    date: yearFromCrossref(message),
    DOI: message.DOI || doi,
    ISSN: message.ISSN?.[0] || "",
    url: message.URL || "",
    abstractNote: message.abstract ? message.abstract.replace(/<[^>]+>/g, "") : "",
    pages: message.page || "",
    volume: message.volume || "",
    issue: message.issue || ""
  };
}

export async function inferPdfMetadata(file) {
  const fallbackTitle = displayTitleFromFilename(file.originalname);
  let text = "";
  let doi = "";

  try {
    const parser = new PDFParse({ data: file.buffer });
    try {
      const parsed = await parser.getText({ partial: [1, 2, 3, 4] });
      text = (parsed.text || "").slice(0, 16000);
    } finally {
      await parser.destroy();
    }
    doi = extractDoi(text);
  } catch {
    return {
      title: fallbackTitle,
      creators: [],
      publicationTitle: "",
      date: "",
      DOI: "",
      ISSN: "",
      url: "",
      abstractNote: "",
      pages: "",
      volume: "",
      issue: "",
      source: "filename"
    };
  }

  const crossref = await fetchCrossrefByDoi(doi).catch(() => null);
  if (crossref?.title) {
    return { ...crossref, source: "crossref-doi" };
  }

  return {
    title: fallbackTitle,
    creators: [],
    publicationTitle: "",
    date: "",
    DOI: doi,
    ISSN: "",
    url: "",
    abstractNote: "",
    pages: "",
    volume: "",
    issue: "",
    source: doi ? "pdf-doi" : "filename"
  };
}

