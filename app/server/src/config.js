import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");

dotenv.config({ path: path.resolve(projectRoot, ".env") });

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function fromRoot(value, fallback) {
  return path.resolve(projectRoot, value || fallback);
}

export const config = {
  projectRoot,
  port: Number(process.env.PORT || 4321),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  zotero: {
    userId: process.env.ZOTERO_USER_ID || "",
    apiKey: process.env.ZOTERO_API_KEY || "",
    libraryType: process.env.ZOTERO_LIBRARY_TYPE || "users",
    inboxCollectionName: process.env.ZOTERO_INBOX_COLLECTION_NAME || "寰呰",
    domainRootCollectionName:
      process.env.ZOTERO_DOMAIN_ROOT_COLLECTION_NAME || "棰嗗煙褰掓。",
    readTag: process.env.ZOTERO_READ_TAG || "read",
    localApiBase: process.env.ZOTERO_LOCAL_API_BASE || "http://127.0.0.1:23119"
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat"
  },
  paths: {
    notesRoot: fromRoot(process.env.NOTES_ROOT, "data/notes"),
    papersRoot: fromRoot(process.env.PAPERS_ROOT, "data/papers"),
    metadataRoot: fromRoot(process.env.METADATA_ROOT, "data/metadata"),
    template: path.resolve(projectRoot, "config/templates/reading-note.md")
  },
  assertZoteroWriteReady() {
    required("ZOTERO_USER_ID");
    required("ZOTERO_API_KEY");
  }
};



