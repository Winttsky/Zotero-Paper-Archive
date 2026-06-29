# Zotero Paper Archive Plan

## Goal

Build a local web app that connects to Zotero, helps finish reading papers, stores a local copy of papers and Markdown notes, and archives completed papers back into Zotero.

## Decisions

- App form: local web app.
- Stack: React + Node/Express.
- Paper source: Zotero library.
- Paper entry: a configured Zotero to-read collection.
- Metadata source: Zotero metadata first.
- Reading UI: metadata and note panel; Zotero or another reader remains responsible for PDF reading.
- Reading record: full structured Markdown reading note.
- Note storage: local Markdown files under the project.
- Archive method: update Zotero collection and tags.
- Domain source: child collections under a configured Zotero domain root collection.
- Domain decision: DeepSeek can suggest, but the user confirms manually.
- Write confirmation: show archive preview before writing.

## File Rules

- PDF copy: `data/papers/<domain>/<year>-<safe-title>-<zoteroKey>.pdf`
- Reading note: `data/notes/<domain>/<year>-<safe-title>-<zoteroKey>.md`
- Item snapshot: `data/metadata/items/<zoteroKey>.json`
- Archive log: `data/metadata/archive-log.jsonl`

