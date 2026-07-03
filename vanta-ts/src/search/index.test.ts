import { describe, expect, it } from "vitest";
import { resolveSearchProvider, resolveSearchProviders } from "./index.js";

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
});
