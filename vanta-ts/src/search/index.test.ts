import { describe, expect, it } from "vitest";
import { resolveSearchProvider, resolveSearchProviders } from "./index.js";

describe("search provider resolution", () => {
  it("auto falls back to keyless DuckDuckGo when no keys are set (works out of the box)", () => {
    const providers = resolveSearchProviders({} as NodeJS.ProcessEnv);
    expect(providers.map((p) => p.id)).toEqual(["ddg"]);
  });

  it("auto prefers configured API providers, then keyless DDG as the final fallback", () => {
    const providers = resolveSearchProviders({
      BRAVE_KEY: "brave-key",
      SERPAPI_KEY: "serp-key",
      VANTA_SEARCH_URL: "http://localhost:8080",
    } as NodeJS.ProcessEnv);

    expect(providers.map((p) => p.id)).toEqual(["brave", "serpapi", "searxng", "ddg"]);
  });

  it("uses only DuckDuckGo when explicitly requested", () => {
    const provider = resolveSearchProvider({ VANTA_SEARCH_PROVIDER: "ddg" } as NodeJS.ProcessEnv);

    expect(provider.id).toBe("ddg");
  });
});
