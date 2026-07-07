import express from "express";
import cors from "cors";
import { config } from "./config.js";
import {
  getCollectionPapers,
  getDomainCollections,
  getInboxPapers,
  getPaper,
  updatePaperArchive
} from "./zotero.js";
import { generatePaperAnalysisNote, suggestDomains } from "./deepseek.js";
import { preparePaperAnalysisInput } from "./paperAnalysis.js";
import {
  attachArchiveMetadata,
  copyPdfIfAvailable,
  saveArchiveMetadata,
  saveReadingNote
} from "./archive.js";
import { importPdfToZotero, uploadPdfMiddleware } from "./importPdf.js";
import { openNoteInVSCode } from "./vscode.js";

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
  asyncRoute(async (req, res) => {
    const domainKey = String(req.query.domainKey || "").trim();
    const domains = await getDomainCollections();

    if (domainKey) {
      const domain = domains.domains.find((entry) => entry.key === domainKey);
      if (!domain) {
        res.status(404).json({ error: "Domain collection not found." });
        return;
      }

      const collectionPapers = await getCollectionPapers(domain);
      res.json({
        ...collectionPapers,
        inbox: null,
        papers: await attachArchiveMetadata(collectionPapers.papers),
        domains: domains.domains,
        view: { type: "domain", domain }
      });
      return;
    }

    const inboxPapers = await getInboxPapers();
    res.json({
      ...inboxPapers,
      papers: await attachArchiveMetadata(inboxPapers.papers),
      domains: domains.domains,
      view: { type: "inbox" }
    });
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
  "/api/ai/analyze-paper",
  asyncRoute(async (req, res) => {
    const { paperKey, maxFigures } = req.body;
    if (!paperKey) {
      res.status(400).json({ error: "paperKey is required." });
      return;
    }

    const paper = await getPaper(paperKey);
    const prepared = await preparePaperAnalysisInput({ paper, maxFigures });
    const generated = await generatePaperAnalysisNote({ analysisInput: prepared.input });

    res.json({
      ok: true,
      markdown: generated.markdown,
      assets: prepared.assets,
      warnings: [...prepared.warnings, ...generated.warnings],
      textStats: prepared.textStats
    });
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

app.post(
  "/api/open-note",
  asyncRoute(async (req, res) => {
    const { notePath } = req.body;
    const result = await openNoteInVSCode(notePath);
    res.json({ ok: true, ...result });
  })
);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || "Unexpected server error" });
});

app.listen(config.port, () => {
  console.log(`Zotero Paper Archive server listening on ${config.port}`);
});







