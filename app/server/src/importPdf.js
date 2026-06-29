import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { config } from "./config.js";
import { ensureDir, safeFilePart } from "./utils.js";
import { inferPdfMetadata } from "./metadata.js";
import { createItems, findCollectionByName, getPaper, uploadAttachmentFile } from "./zotero.js";

export const uploadPdfMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true);
      return;
    }
    cb(new Error("Only PDF files can be imported."));
  }
}).single("pdf");

function cleanTitleFromFilename(filename) {
  return safeFilePart(filename.replace(/\.pdf$/i, ""), "Untitled PDF");
}

async function saveInboxPdf(file) {
  const inboxDir = path.join(config.paths.papersRoot, "_inbox");
  const baseName = safeFilePart(file.originalname.replace(/\.pdf$/i, ""), "paper");
  const targetName = `${Date.now()}-${baseName}.pdf`;
  const targetPath = path.join(inboxDir, targetName);
  await ensureDir(inboxDir);
  await fs.writeFile(targetPath, file.buffer);
  return targetPath;
}

export async function importPdfToZotero(file) {
  if (!file) {
    throw new Error("No PDF file was uploaded.");
  }

  const inbox = await findCollectionByName(config.zotero.inboxCollectionName);
  if (!inbox) {
    throw new Error(`Zotero collection not found: ${config.zotero.inboxCollectionName}`);
  }

  const metadata = await inferPdfMetadata(file);
  const title = metadata.title || cleanTitleFromFilename(file.originalname);
  const savedPath = await saveInboxPdf(file);
  const tags = [{ tag: "to-read" }, { tag: "imported-from-webapp" }];

  const parentResponse = await createItems([
    {
      itemType: "journalArticle",
      title,
      creators: metadata.creators || [],
      abstractNote: metadata.abstractNote || "",
      publicationTitle: metadata.publicationTitle || "",
      volume: metadata.volume || "",
      issue: metadata.issue || "",
      pages: metadata.pages || "",
      date: metadata.date || "",
      series: "",
      seriesTitle: "",
      seriesText: "",
      journalAbbreviation: "",
      language: "",
      DOI: metadata.DOI || "",
      ISSN: metadata.ISSN || "",
      shortTitle: "",
      url: metadata.url || "",
      accessDate: "",
      archive: "",
      archiveLocation: "",
      libraryCatalog: "",
      callNumber: "",
      rights: "",
      extra: `Imported from Zotero Paper Archive on ${new Date().toISOString()}\nMetadata source: ${metadata.source || "filename"}`,
      tags,
      collections: [inbox.key],
      relations: {}
    }
  ]);

  const parentKey = parentResponse.successful?.["0"]?.key;
  if (!parentKey) {
    throw new Error(`Zotero parent item creation failed: ${JSON.stringify(parentResponse.failed || parentResponse)}`);
  }

  const attachmentResponse = await createItems([
    {
      itemType: "attachment",
      parentItem: parentKey,
      linkMode: "imported_file",
      title: file.originalname,
      note: "",
      tags: [],
      relations: {},
      contentType: "application/pdf",
      charset: "",
      filename: file.originalname,
      md5: null,
      mtime: null
    }
  ]);

  const attachmentKey = attachmentResponse.successful?.["0"]?.key;
  if (!attachmentKey) {
    throw new Error(`Zotero attachment item creation failed: ${JSON.stringify(attachmentResponse.failed || attachmentResponse)}`);
  }

  const md5 = crypto.createHash("md5").update(file.buffer).digest("hex");
  await uploadAttachmentFile({
    attachmentKey,
    filename: file.originalname,
    buffer: file.buffer,
    md5,
    mtime: Date.now()
  });

  const paper = await getPaper(parentKey);
  return {
    inbox: { key: inbox.key, name: inbox.data.name, version: inbox.version },
    paper,
    parentKey,
    attachmentKey,
    localPdfPath: savedPath,
    metadataSource: metadata.source
  };
}


