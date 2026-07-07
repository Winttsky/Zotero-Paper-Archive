import fs from "node:fs/promises";
import { config } from "./config.js";

const DIRECT_TEXT_LIMIT = 70000;
const CHUNK_TEXT_LIMIT = 18000;

function stripFrontmatter(markdown) {
  if (!markdown.startsWith("---")) return markdown.trim();
  const end = markdown.indexOf("\n---", 3);
  if (end < 0) return markdown.trim();
  return markdown.slice(end + 4).trim();
}

async function loadPaperAnalysisSkill() {
  const content = await fs.readFile(config.paths.deepseekPaperAnalysisSkill, "utf8");
  return stripFrontmatter(content);
}

async function deepseekChat({ messages, temperature = 0.2, responseFormat }) {
  if (!config.deepseek.apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured.");
  }

  const body = {
    model: config.deepseek.model,
    messages,
    temperature
  };
  if (responseFormat) body.response_format = responseFormat;

  const response = await fetch(`${config.deepseek.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.deepseek.apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`DeepSeek ${response.status}: ${responseBody || response.statusText}`);
  }

  const payload = await response.json();
  return payload.choices?.[0]?.message?.content || "";
}

export async function suggestDomains({ paper, domains }) {
  if (!config.deepseek.apiKey) {
    return {
      suggestions: [],
      reason: "DEEPSEEK_API_KEY is not configured."
    };
  }

  const domainNames = domains.map((domain) => domain.name).join(", ");
  const prompt = [
    "You help classify academic papers into an existing local taxonomy.",
    "Return strict JSON only with this shape:",
    '{"suggestions":[{"domain":"name","confidence":0.0,"reason":"short reason"}]}',
    `Available domains: ${domainNames || "(none)"}`,
    "",
    `Title: ${paper.title}`,
    `Authors: ${paper.authors}`,
    `Venue: ${paper.venue}`,
    `Year: ${paper.year}`,
    `Existing tags: ${(paper.tags || []).join(", ")}`,
    `Abstract: ${paper.abstractNote || "(empty)"}`
  ].join("\n");

  const content = await deepseekChat({
    messages: [
      {
        role: "system",
        content:
          "Classify papers into the user's provided domain list. Do not invent domains unless no listed domain is suitable."
      },
      { role: "user", content: prompt }
    ],
    temperature: 0.2,
    responseFormat: { type: "json_object" }
  });

  const parsed = JSON.parse(content || "{}");
  return { suggestions: parsed.suggestions || [] };
}

function totalPageCharacters(pageTextDigest = []) {
  return pageTextDigest.reduce((sum, page) => sum + String(page.text || "").length, 0);
}

function chunkPageText(pageTextDigest = [], limit = CHUNK_TEXT_LIMIT) {
  const chunks = [];
  let current = [];
  let currentLength = 0;

  for (const page of pageTextDigest) {
    const text = String(page.text || "");
    const addition = text.length + 80;
    if (current.length && currentLength + addition > limit) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(page);
    currentLength += addition;
  }

  if (current.length) chunks.push(current);
  return chunks;
}

function visualBelongsToChunk(visual, pages) {
  if (!visual?.nearbyText) return false;
  return pages.some((page) => {
    const text = String(page.text || "");
    return text && visual.nearbyText.includes(text.slice(0, 120));
  });
}

async function summarizeChunk({ skill, analysisInput, pages, index, total }) {
  const chunkInput = {
    metadata: analysisInput.metadata,
    pageTextDigest: pages,
    visuals: (analysisInput.visuals || []).filter((visual) => visualBelongsToChunk(visual, pages)),
    tables: analysisInput.tables || []
  };

  return deepseekChat({
    messages: [
      {
        role: "system",
        content: `${skill}\n\nYou are now preparing an intermediate chunk summary. Preserve original excerpts, citation markers, figure/table codes, participant counts, ECG methods, features, models, metrics, and limitations. Do not include page numbers. Return concise Markdown only.`
      },
      {
        role: "user",
        content: [
          `Chunk ${index + 1} of ${total}.`,
          "Extract only information supported by this chunk for the final ECG-depression note.",
          "Input JSON:",
          JSON.stringify(chunkInput, null, 2)
        ].join("\n")
      }
    ],
    temperature: 0.15
  });
}

export async function generatePaperAnalysisNote({ analysisInput }) {
  const skill = await loadPaperAnalysisSkill();
  const warnings = [];
  const pageTextDigest = analysisInput.pageTextDigest || [];
  const totalCharacters = totalPageCharacters(pageTextDigest);
  let finalInput = analysisInput;

  if (totalCharacters > DIRECT_TEXT_LIMIT) {
    const chunks = chunkPageText(pageTextDigest);
    const chunkSummaries = [];
    for (let index = 0; index < chunks.length; index += 1) {
      const summary = await summarizeChunk({
        skill,
        analysisInput,
        pages: chunks[index],
        index,
        total: chunks.length
      });
      chunkSummaries.push({ chunkId: String(index + 1), summary });
    }
    finalInput = {
      ...analysisInput,
      pageTextDigest: [],
      chunkSummaries
    };
  }

  const markdown = await deepseekChat({
    messages: [
      { role: "system", content: skill },
      {
        role: "user",
        content: [
          "Generate the final Markdown reading note for this ECG-depression paper.",
          "Follow the required 12-section structure exactly.",
          "Use summary + corresponding original text + corresponding image logic where required.",
          "Do not include page numbers in the final note.",
          "Input JSON:",
          JSON.stringify(finalInput, null, 2)
        ].join("\n")
      }
    ],
    temperature: 0.15
  });

  if (!markdown.trim()) {
    warnings.push("DeepSeek returned an empty analysis note.");
  }

  return { markdown: markdown.trim(), warnings };
}
