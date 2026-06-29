# Zotero Paper Archive

A local reading workflow app for Zotero papers.

It reads papers from a Zotero "to-read" collection, shows metadata in a browser, helps draft structured Markdown reading notes, asks DeepSeek for optional domain suggestions, and archives finished papers into a domain collection with status/domain tags.

## Project Layout

```text
app/
  client/      React frontend
  server/      Node/Express backend
config/
  templates/   Markdown note templates
data/
  papers/      Local PDF copies, grouped by domain
  notes/       Markdown reading notes, grouped by domain
  metadata/    Zotero snapshots and archive logs
```

## First Run

1. Install Node LTS if `node -v` is not available in your terminal.
2. Copy `.env.example` to `.env` and fill in Zotero and DeepSeek keys.
3. Install dependencies:

```bash
pnpm install
```

4. Start the app:

```bash
pnpm dev
```

The frontend runs on `http://localhost:5173`; the backend runs on `http://localhost:4321`.

## Zotero Setup

- Create a Zotero API key with personal library read/write access.
- Create a to-read collection, default name: `待读`.
- Create a domain root collection, default name: `领域归档`.
- Add domain collections as children of `领域归档`.

The app uses Zotero Web API for item collection/tag updates. Zotero's local API is used only for best-effort PDF attachment copying when available.

