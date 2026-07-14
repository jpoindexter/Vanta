import { describe, expect, it, vi } from "vitest";
import { discoverProviderModels } from "./model-discovery.js";

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

describe("discoverProviderModels", () => {
  it("loads and deduplicates OpenAI models without exposing the key", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toEqual({ authorization: "Bearer secret-openai-key" });
      return response({ data: [{ id: "gpt-5.6-sol" }, { id: "gpt-5.6-sol" }, { id: "gpt-5.5" }] });
    }) as typeof fetch;

    await expect(discoverProviderModels("openai", { OPENAI_API_KEY: "secret-openai-key" }, fetcher)).resolves.toEqual({
      models: ["gpt-5.6-sol", "gpt-5.5"], source: "live", available: true,
    });
  });

  it("filters Gemini entries to generateContent-capable models and follows pagination", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({
        models: [
          { baseModelId: "gemini-3.5-flash", supportedGenerationMethods: ["generateContent"] },
          { baseModelId: "embedding-001", supportedGenerationMethods: ["embedContent"] },
        ],
        nextPageToken: "page-2",
      }))
      .mockResolvedValueOnce(response({ models: [{ name: "models/gemini-3.1-pro-preview", supportedGenerationMethods: ["generateContent"] }] })) as typeof fetch;

    const result = await discoverProviderModels("gemini", { GEMINI_API_KEY: "gemini-key" }, fetcher);
    expect(result.models).toEqual(["gemini-3.5-flash", "gemini-3.1-pro-preview"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(fetcher).mock.calls[1]?.[0])).toContain("pageToken=page-2");
  });

  it("uses Anthropic cursor pagination", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ data: [{ id: "claude-sonnet-5" }], has_more: true, last_id: "claude-sonnet-5" }))
      .mockResolvedValueOnce(response({ data: [{ id: "claude-fable-5" }], has_more: false })) as typeof fetch;

    const result = await discoverProviderModels("anthropic", { ANTHROPIC_API_KEY: "anthropic-key" }, fetcher);
    expect(result.models).toEqual(["claude-sonnet-5", "claude-fable-5"]);
    expect(String(vi.mocked(fetcher).mock.calls[1]?.[0])).toContain("after_id=claude-sonnet-5");
  });

  it("falls back to catalog state when credentials are unavailable", async () => {
    await expect(discoverProviderModels("openai", {})).resolves.toEqual({ models: [], source: "catalog", available: false });
  });

  it("returns a redacted status-only failure", async () => {
    const fetcher = vi.fn(async () => response({ error: { message: "secret-token leaked" } }, 401)) as typeof fetch;
    await expect(discoverProviderModels("openai", { OPENAI_API_KEY: "secret-token" }, fetcher)).resolves.toEqual({
      models: [], source: "catalog", available: true, error: "Model discovery failed (HTTP 401)",
    });
  });
});
