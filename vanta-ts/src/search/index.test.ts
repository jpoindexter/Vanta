import { describe, expect, it } from "vitest";
import { resolveSearchProvider, resolveSearchProviders, backendIdFor } from "./index.js";

describe("search provider resolution", () => {
  it("auto leads with keyless brave_browser (the one that works), then the fetch scrapers", () => {
    const providers = resolveSearchProviders({} as NodeJS.ProcessEnv);
    expect(providers.map((p) => p.id)).toEqual(["brave_browser", "bing", "jina_ddg", "ddg"]);
  });

  it("auto prefers configured API providers, then keyless engines as final fallbacks", () => {
    const providers = resolveSearchProviders({
      BRAVE_KEY: "brave-key",
      SERPAPI_KEY: "serp-key",
      VANTA_SEARCH_URL: "http://localhost:8080",
    } as NodeJS.ProcessEnv);

    expect(providers.map((p) => p.id)).toEqual(["brave", "serpapi", "searxng", "brave_browser", "bing", "jina_ddg", "ddg"]);
  });

  it("uses only DuckDuckGo when explicitly requested", () => {
    const provider = resolveSearchProvider({ VANTA_SEARCH_PROVIDER: "ddg" } as NodeJS.ProcessEnv);

    expect(provider.id).toBe("ddg");
  });

  it("uses only Bing when explicitly requested", () => {
    const provider = resolveSearchProvider({ VANTA_SEARCH_PROVIDER: "bing" } as NodeJS.ProcessEnv);

    expect(provider.id).toBe("bing");
  });

  it("uses only Jina DDG when explicitly requested", () => {
    const provider = resolveSearchProvider({ VANTA_SEARCH_PROVIDER: "jina_ddg" } as NodeJS.ProcessEnv);

    expect(provider.id).toBe("jina_ddg");
  });

  it("selects Exa by name (needs EXA_API_KEY) — WEB-BACKEND-EXA", () => {
    const provider = resolveSearchProvider({ VANTA_SEARCH_PROVIDER: "exa", EXA_API_KEY: "exa-key" } as NodeJS.ProcessEnv);
    expect(provider.id).toBe("exa");
  });

  it("errors when exa is requested without a key", () => {
    expect(() => resolveSearchProvider({ VANTA_SEARCH_PROVIDER: "exa" } as NodeJS.ProcessEnv)).toThrow(/EXA_API_KEY/);
  });

  it("auto leads with Exa when EXA_API_KEY is present", () => {
    const providers = resolveSearchProviders({ EXA_API_KEY: "exa-key" } as NodeJS.ProcessEnv);
    expect(providers[0]?.id).toBe("exa");
  });

  it("selects each managed backend by name — WEB-BACKENDS-MANAGED", () => {
    expect(resolveSearchProvider({ VANTA_SEARCH_PROVIDER: "firecrawl", FIRECRAWL_API_KEY: "k" } as NodeJS.ProcessEnv).id).toBe("firecrawl");
    expect(resolveSearchProvider({ VANTA_SEARCH_PROVIDER: "tavily", TAVILY_API_KEY: "k" } as NodeJS.ProcessEnv).id).toBe("tavily");
    expect(resolveSearchProvider({ VANTA_SEARCH_PROVIDER: "parallel", PARALLEL_API_KEY: "k" } as NodeJS.ProcessEnv).id).toBe("parallel");
  });

  it("errors when a managed backend is requested without its key", () => {
    expect(() => resolveSearchProvider({ VANTA_SEARCH_PROVIDER: "firecrawl" } as NodeJS.ProcessEnv)).toThrow(/FIRECRAWL_API_KEY/);
  });

  it("auto detects managed backends in the documented priority (Firecrawl → Parallel → Tavily → Exa)", () => {
    const providers = resolveSearchProviders({
      FIRECRAWL_API_KEY: "f", PARALLEL_API_KEY: "p", TAVILY_API_KEY: "t", EXA_API_KEY: "e",
    } as NodeJS.ProcessEnv);
    expect(providers.slice(0, 4).map((p) => p.id)).toEqual(["firecrawl", "parallel", "tavily", "exa"]);
  });

  it("selects xai by name (needs XAI_API_KEY) — WEB-BACKEND-XAI-GROK", () => {
    const provider = resolveSearchProvider({ VANTA_SEARCH_PROVIDER: "xai", XAI_API_KEY: "xai-key" } as NodeJS.ProcessEnv);
    expect(provider.id).toBe("xai");
  });

  it("errors when xai is requested without a key", () => {
    expect(() => resolveSearchProvider({ VANTA_SEARCH_PROVIDER: "xai" } as NodeJS.ProcessEnv)).toThrow(/XAI_API_KEY/);
  });

  it("auto slots xai in right after Exa, ahead of Brave", () => {
    const providers = resolveSearchProviders({
      EXA_API_KEY: "e", XAI_API_KEY: "x", BRAVE_KEY: "b",
    } as NodeJS.ProcessEnv);
    expect(providers.map((p) => p.id)).toEqual(["exa", "xai", "brave", "brave_browser", "bing", "jina_ddg", "ddg"]);
  });
});

describe("WEB-BACKEND-SPLIT — per-capability backend", () => {
  it("backendIdFor: per-capability override wins, else the shared provider, else auto", () => {
    const env = { VANTA_SEARCH_PROVIDER: "brave", VANTA_SEARCH_BACKEND: "ddg", VANTA_EXTRACT_BACKEND: "exa" } as NodeJS.ProcessEnv;
    expect(backendIdFor(env, "search")).toBe("ddg");
    expect(backendIdFor(env, "extract")).toBe("exa");
    // No per-cap override → the shared provider drives both.
    expect(backendIdFor({ VANTA_SEARCH_PROVIDER: "brave" } as NodeJS.ProcessEnv, "search")).toBe("brave");
    expect(backendIdFor({ VANTA_SEARCH_PROVIDER: "brave" } as NodeJS.ProcessEnv, "extract")).toBe("brave");
    // Nothing set → auto.
    expect(backendIdFor({} as NodeJS.ProcessEnv, "search")).toBe("auto");
  });

  it("search and extract resolve to DIFFERENT backends when split", () => {
    const env = { VANTA_SEARCH_BACKEND: "ddg", VANTA_EXTRACT_BACKEND: "bing" } as NodeJS.ProcessEnv;
    expect(resolveSearchProvider(env, "search").id).toBe("ddg");
    expect(resolveSearchProvider(env, "extract").id).toBe("bing");
  });

  it("a single VANTA_SEARCH_PROVIDER drives both capabilities (back-compatible)", () => {
    const env = { VANTA_SEARCH_PROVIDER: "bing" } as NodeJS.ProcessEnv;
    expect(resolveSearchProvider(env, "search").id).toBe("bing");
    expect(resolveSearchProvider(env, "extract").id).toBe("bing");
    // default capability is search
    expect(resolveSearchProvider(env).id).toBe("bing");
  });
});
