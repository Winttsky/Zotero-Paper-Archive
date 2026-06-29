import express from "express";
import cors from "cors";
import { config } from "./config.js";
import {
  getDomainCollections,
  getInboxPapers,
  getPaper,
  updatePaperArchive
} from "./zotero.js";
import { suggestDomains } from "./deepseek.js";
import {
  copyPdfIfAvailable,
  saveArchiveMetadata,
  saveReadingNote
} from "./archive.js";
import { importPdfToZotero, uploadPdfMiddleware } from "./importPdf.js";

const app = express();

app.use(cors({ origin: [config.clientOrigin, "http://127.0.0.1:5173", "http://localhost:5173"] }));
app.use(express.json({ limit: "2mb" }));

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function handlePdfUpload(req, res, next) {
  uploadPdfMiddleware(req, res, (error) => {
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No PDF file was uploaded." });
      return;
    }
    next();
  });
}
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    configured: {
      zotero: Boolean(config.zotero.userId && config.zotero.apiKey),
      deepseek: Boolean(config.deepseek.apiKey)
    }
  });
});

app.get(
  "/api/domains",
  asyncRoute(async (_req, res) => {
    res.json(await getDomainCollections());
  })
);

app.get(
  "/api/papers",
  asyncRoute(async (_req, res) => {
    const [papers, domains] = await Promise.all([
      getInboxPapers(),
      getDomainCollections()
    ]);
    res.json({ ...papers, domains: domains.domains });
  })
);

app.get(
  "/api/papers/:key",
  asyncRoute(async (req, res) => {
    res.json(await getPaper(req.params.key));
  })
);

app.post(
  "/api/ai/suggest-domain",
  asyncRoute(async (req, res) => {
    const { paperKey } = req.body;
    const [paper, domains] = await Promise.all([
      getPaper(paperKey),
      getDomainCollections()
    ]);
    res.json(await suggestDomains({ paper, domains: domains.domains }));
  })
);


app.post(
  "/api/import/pdf",
  handlePdfUpload,
  asyncRoute(async (req, res) => {
    const result = await importPdfToZotero(req.file);
    res.json({ ok: true, ...result });
  })
);
app.post(
  "/api/archive",
  asyncRoute(async (req, res) => {
    const { paperKey, paperVersion, inboxCollectionKey, domain, noteBody } = req.body;
    if (!paperKey || !domain?.key || !domain?.name) {
      res.status(400).json({ error: "paperKey and domain are required." });
      return;
    }

    const before = await getPaper(paperKey);
    const notePath = await saveReadingNote({
      paper: before,
      domainName: domain.name,
      noteBody
    });
    const pdf = await copyPdfIfAvailable({ paper: before, domainName: domain.name });
    const after = await updatePaperArchive({
      itemKey: paperKey,
      itemVersion: paperVersion,
      inboxCollectionKey,
      domainCollectionKey: domain.key,
      domainName: domain.name
    });
    const metadata = await saveArchiveMetadata({
      before,
      after,
      domainName: domain.name,
      notePath,
      pdf
    });

    res.json({ ok: true, notePath, pdf, metadata, paper: after });
  })
);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || "Unexpected server error" });
});

app.listen(config.port, () => {
  console.log(`Zotero Paper Archive server listening on ${config.port}`);
});







