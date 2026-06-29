export function buildNote(paper, domainName = "") {
  return `---
title: "${paper.title || ""}"
authors: "${paper.authors || ""}"
year: "${paper.year || ""}"
venue: "${paper.venue || ""}"
doi: "${paper.doi || ""}"
zoteroKey: "${paper.key || ""}"
domain: "${domainName}"
archivedAt: ""
---

# ${paper.title || "Untitled"}

## 1. Basic Information

- Authors: ${paper.authors || ""}
- Venue: ${paper.venue || ""}
- Year: ${paper.year || ""}
- DOI: ${paper.doi || ""}
- Zotero key: ${paper.key || ""}
- Domain: ${domainName}

## 2. Research Question


## 3. Method


## 4. Data / Materials


## 5. Main Results


## 6. Contributions


## 7. Limitations


## 8. Useful Citations / Reusable Ideas


## 9. Personal Summary

`;
}

