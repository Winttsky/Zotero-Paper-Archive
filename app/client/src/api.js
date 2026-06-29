const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:4321";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || response.statusText);
  }
  return payload;
}

export const api = {
  health: () => request("/api/health"),
  papers: () => request("/api/papers"),
  importPdf: async (file) => {
    const form = new FormData();
    form.append("pdf", file);
    const response = await fetch(`${API_BASE}/api/import/pdf`, {
      method: "POST",
      body: form
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || response.statusText);
    }
    return payload;
  },
  suggestDomain: (paperKey) =>
    request("/api/ai/suggest-domain", {
      method: "POST",
      body: JSON.stringify({ paperKey })
    }),
  archive: (payload) =>
    request("/api/archive", {
      method: "POST",
      body: JSON.stringify(payload)
    })
};




