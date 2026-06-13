import { describe, expect, it } from "vitest";
import { resolveSearchProvider, resolveSearchProviders } from "./index.js";

describe("search provider resolution", () => {
  it("auto falls back to keyless Bing and DuckDuckGo when no keys are set", () => {
    const providers = resolveSearchProviders({} as NodeJS.ProcessEnv);
    expect(providers.map((p) => p.id)).toEqual(["bing", "jina_ddg", "ddg"]);
  });

  it("auto prefers configured API providers, then keyless engines as final fallbacks", () => {
    const providers = resolveSearchProviders({
      BRAVE_KEY: "brave-key",
      SERPAPI_KEY: "serp-key",
      VANTA_SEARCH_URL: "http://localhost:8080",
    } as NodeJS.ProcessEnv);

    expect(providers.map((p) => p.id)).toEqual(["brave", "serpapi", "searxng", "bing", "jina_ddg", "ddg"]);
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
});
