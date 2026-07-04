import { describe, it, expect } from "vitest";
import { buildXaiBody, mapXaiResponse, validateXaiDomains, XaiSearchProvider } from "./xai.js";

describe("buildXaiBody (WEB-BACKEND-XAI-GROK)", () => {
  it("sends the query as input + a bare web_search tool by default", () => {
    const body = buildXaiBody("who founded xAI", "grok-4.3");
    expect(body).toEqual({
      model: "grok-4.3",
      input: [{ role: "user", content: "who founded xAI" }],
      tools: [{ type: "web_search" }],
    });
  });

  it("nests allowedDomains under tools[0].filters.allowed_domains", () => {
    const body = buildXaiBody("q", "grok-4.3", { allowedDomains: ["x.ai"] }) as { tools: [{ filters?: unknown }] };
    expect(body.tools[0].filters).toEqual({ allowed_domains: ["x.ai"] });
  });

  it("nests excludedDomains under tools[0].filters.excluded_domains", () => {
    const body = buildXaiBody("q", "grok-4.3", { excludedDomains: ["pinterest.com"] }) as { tools: [{ filters?: unknown }] };
    expect(body.tools[0].filters).toEqual({ excluded_domains: ["pinterest.com"] });
  });
});

describe("validateXaiDomains", () => {
  it("passes with 5 or fewer domains, or none", () => {
    expect(validateXaiDomains()).toBeNull();
    expect(validateXaiDomains({ allowedDomains: ["a", "b", "c", "d", "e"] })).toBeNull();
    expect(validateXaiDomains({ excludedDomains: ["a"] })).toBeNull();
  });

  it("rejects more than 5 allowed or excluded domains", () => {
    expect(validateXaiDomains({ allowedDomains: ["a", "b", "c", "d", "e", "f"] })).toMatch(/capped at 5/);
    expect(validateXaiDomains({ excludedDomains: ["a", "b", "c", "d", "e", "f"] })).toMatch(/capped at 5/);
  });

  it("rejects passing both allowed and excluded (mutually exclusive, xAI's own constraint)", () => {
    expect(validateXaiDomains({ allowedDomains: ["a"], excludedDomains: ["b"] })).toMatch(/mutually exclusive/);
  });
});

describe("mapXaiResponse (real verified shape: output[].content[].annotations, NOT top-level output_text/citations)", () => {
  // Mirrors the shape confirmed against the live /v1/responses API — the exact
  // bug openclaw/openclaw#13171 hit by assuming a top-level output_text/citations.
  function fixture(text: string, annotations: unknown[]): unknown {
    return {
      output: [
        { type: "reasoning", content: [] }, // a non-message item the parser must skip
        {
          type: "message",
          content: [{ type: "output_text", text, annotations }],
        },
      ],
    };
  }

  it("maps each citation annotation to a SearchResult, snippet = the cited span", () => {
    const text = "xAI was founded by Elon Musk in 2023. It builds the Grok models.";
    const json = fixture(text, [
      { title: "About xAI", url: "https://x.ai/about", start_index: 0, end_index: 37 },
      { title: "Grok models", url: "https://x.ai/grok", start_index: 39, end_index: 65 },
    ]);
    const results = mapXaiResponse(json, 5);
    expect(results).toEqual([
      { title: "About xAI", url: "https://x.ai/about", snippet: text.slice(0, 37) },
      { title: "Grok models", url: "https://x.ai/grok", snippet: text.slice(39, 65) },
    ]);
    expect(results[0]?.snippet).toBe("xAI was founded by Elon Musk in 2023.");
    expect(results[1]?.snippet).toBe("t builds the Grok models.");
  });

  it("skips an annotation missing a title or url", () => {
    const json = fixture("text", [{ url: "https://x/1", start_index: 0, end_index: 4 }, { title: "ok", url: "https://x/2", start_index: 0, end_index: 4 }]);
    expect(mapXaiResponse(json, 5)).toHaveLength(1);
  });

  it("caps to max", () => {
    const anns = Array.from({ length: 5 }, (_, i) => ({ title: `t${i}`, url: `https://x/${i}`, start_index: 0, end_index: 1 }));
    expect(mapXaiResponse(fixture("abcde", anns), 2)).toHaveLength(2);
  });

  it("returns [] when there's no message/output_text block, or malformed input", () => {
    expect(mapXaiResponse({ output: [{ type: "reasoning" }] }, 5)).toEqual([]);
    expect(mapXaiResponse({}, 5)).toEqual([]);
    expect(mapXaiResponse(null, 5)).toEqual([]);
  });

  it("returns [] when the message has no annotations (a plain answer, no citations)", () => {
    const json = { output: [{ type: "message", content: [{ type: "output_text", text: "no sources" }] }] };
    expect(mapXaiResponse(json, 5)).toEqual([]);
  });
});

describe("XaiSearchProvider", () => {
  it("advertises native domain filtering, id, and defaults the model", () => {
    const p = new XaiSearchProvider({ apiKey: "k" });
    expect(p.filtersDomains).toBe(true);
    expect(p.id).toBe("xai");
  });

  it("rejects a search with too many domains before any fetch", async () => {
    const p = new XaiSearchProvider({ apiKey: "k" });
    await expect(p.search("q", { allowedDomains: ["a", "b", "c", "d", "e", "f"] })).rejects.toThrow(/capped at 5/);
  });
});
