import { config } from "./config.js";

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

  const response = await fetch(`${config.deepseek.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.deepseek.apiKey}`
    },
    body: JSON.stringify({
      model: config.deepseek.model,
      messages: [
        {
          role: "system",
          content:
            "Classify papers into the user's provided domain list. Do not invent domains unless no listed domain is suitable."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DeepSeek ${response.status}: ${body || response.statusText}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return { suggestions: parsed.suggestions || [] };
}

