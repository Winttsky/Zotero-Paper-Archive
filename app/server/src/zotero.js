import { config } from "./config.js";
import { itemToPaper } from "./utils.js";

const API_ROOT = "https://api.zotero.org";

function libraryBase() {
  config.assertZoteroWriteReady();
  return `${API_ROOT}/${config.zotero.libraryType}/${config.zotero.userId}`;
}

async function zoteroFetch(path, options = {}) {
  const response = await fetch(`${libraryBase()}${path}`, {
    ...options,
    headers: {
      "Zotero-API-Version": "3",
      "Zotero-API-Key": config.zotero.apiKey,
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Zotero ${response.status}: ${body || response.statusText}`);
  }

  if (response.status === 204) return null;
  return response.json();
}
export async function createItems(items) {
  return zoteroFetch("/items", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Zotero-Write-Token": `${Date.now()}-${Math.random().toString(16).slice(2)}`
    },
    body: JSON.stringify(items)
  });
}

export async function getCollections() {
  return zoteroFetch("/collections?limit=100&sort=title");
}

export async function findCollectionByName(name, collections = null) {
  const all = collections || (await getCollections());
  return all.find((entry) => entry.data?.name === name) || null;
}

export async function getDomainCollections() {
  const collections = await getCollections();
  const root = await findCollectionByName(
    config.zotero.domainRootCollectionName,
    collections
  );
  if (!root) {
    return { root: null, domains: [] };
  }

  const domains = collections
    .filter((entry) => entry.data?.parentCollection === root.key)
    .map((entry) => ({
      key: entry.key,
      name: entry.data.name,
      version: entry.version
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));

  return {
    root: { key: root.key, name: root.data.name, version: root.version },
    domains
  };
}

function collectionSummary(collection) {
  return {
    key: collection.key,
    name: collection.name || collection.data?.name || "",
    version: collection.version
  };
}

export async function getCollectionPapers(collection) {
  if (!collection?.key) {
    return { collection: null, papers: [] };
  }

  const items = await zoteroFetch(
    `/collections/${collection.key}/items/top?include=data&limit=100&sort=dateAdded&direction=desc`
  );

  return {
    collection: collectionSummary(collection),
    papers: items
      .filter((item) => item.data?.itemType !== "attachment")
      .map(itemToPaper)
  };
}

export async function getInboxPapers() {
  const inbox = await findCollectionByName(config.zotero.inboxCollectionName);
  if (!inbox) {
    return { inbox: null, papers: [] };
  }

  const result = await getCollectionPapers(inbox);
  return {
    inbox: result.collection,
    papers: result.papers
  };
}

export async function getPaper(itemKey) {
  const item = await zoteroFetch(`/items/${itemKey}?include=data`);
  return itemToPaper(item);
}

export async function updatePaperArchive({
  itemKey,
  itemVersion,
  inboxCollectionKey,
  domainCollectionKey,
  domainName
}) {
  const current = await zoteroFetch(`/items/${itemKey}?include=data`);
  const data = current.data;
  const version = itemVersion || current.version;
  const collectionSet = new Set(data.collections || []);

  if (inboxCollectionKey) collectionSet.delete(inboxCollectionKey);
  collectionSet.add(domainCollectionKey);

  const tagSet = new Set((data.tags || []).map((tag) => tag.tag));
  tagSet.add(config.zotero.readTag);
  tagSet.add(domainName);

  const patchBody = {
    collections: Array.from(collectionSet),
    tags: Array.from(tagSet).map((tag) => ({ tag }))
  };

  await zoteroFetch(`/items/${itemKey}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "If-Unmodified-Since-Version": String(version)
    },
    body: JSON.stringify(patchBody)
  });

  return getPaper(itemKey);
}


export async function uploadAttachmentFile({ attachmentKey, filename, buffer, md5, mtime }) {
  const authParams = new URLSearchParams({
    md5,
    filename,
    filesize: String(buffer.length),
    mtime: String(mtime)
  });

  const authorization = await zoteroFetch(`/items/${attachmentKey}/file`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "If-None-Match": "*"
    },
    body: authParams.toString()
  });

  if (authorization?.exists === 1) {
    return { exists: true };
  }

  const uploadBody = Buffer.concat([
    Buffer.from(authorization.prefix, "utf8"),
    buffer,
    Buffer.from(authorization.suffix, "utf8")
  ]);

  const uploadResponse = await fetch(authorization.url, {
    method: "POST",
    headers: {
      "Content-Type": authorization.contentType
    },
    body: uploadBody
  });

  if (!uploadResponse.ok) {
    const body = await uploadResponse.text();
    throw new Error(`Zotero file upload ${uploadResponse.status}: ${body || uploadResponse.statusText}`);
  }

  const registerParams = new URLSearchParams({
    upload: authorization.uploadKey
  });

  await zoteroFetch(`/items/${attachmentKey}/file`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "If-None-Match": "*"
    },
    body: registerParams.toString()
  });

  return { exists: false, uploadKey: authorization.uploadKey };
}

export async function getLocalPdfPath(itemKey) {
  const base = config.zotero.localApiBase.replace(/\/$/, "");
  const childrenResponse = await fetch(
    `${base}/api/users/0/items/${itemKey}/children`
  );
  if (!childrenResponse.ok) return null;

  const children = await childrenResponse.json();
  const pdfAttachment = children.find((entry) => {
    const data = entry.data || {};
    return data.itemType === "attachment" && /pdf/i.test(data.contentType || "");
  });

  if (!pdfAttachment?.key) return null;

  const urlResponse = await fetch(
    `${base}/api/users/0/items/${pdfAttachment.key}/file/view/url`
  );
  if (!urlResponse.ok) return null;

  const fileUrl = await urlResponse.text();
  if (!fileUrl.startsWith("file://")) return null;
  return decodeURIComponent(new URL(fileUrl).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
}


