import { DuckDuckGoProvider } from "./duckduckgo.js";
import { SearxngProvider } from "./searxng.js";
import { SerpapiProvider } from "./serpapi.js";
import { BraveProvider } from "./brave.js";
import type { SearchProvider } from "./interface.js";

/**
 * Resolve a search provider from environment.
 *   ARGO_SEARCH_PROVIDER=ddg     → DuckDuckGo HTML scrape (no key, default)
 *   ARGO_SEARCH_PROVIDER=searxng → self-hosted SearXNG (needs ARGO_SEARCH_URL)
 *   ARGO_SEARCH_PROVIDER=serpapi → SerpApi (needs SERPAPI_KEY)
 *   ARGO_SEARCH_PROVIDER=brave   → Brave Search API (needs BRAVE_KEY)
 */
export function resolveSearchProvider(env: NodeJS.ProcessEnv): SearchProvider {
  const provider = (env.ARGO_SEARCH_PROVIDER ?? "ddg").toLowerCase();

  switch (provider) {
    case "ddg":
      return new DuckDuckGoProvider();
    case "searxng": {
      const baseUrl = env.ARGO_SEARCH_URL;
      if (!baseUrl) {
        throw new Error(
          "ARGO_SEARCH_URL is required for searxng. Set it in argo-ts/.env (e.g. http://localhost:8080).",
        );
      }
      return new SearxngProvider({ baseUrl });
    }
    case "serpapi": {
      const apiKey = env.SERPAPI_KEY;
      if (!apiKey) {
        throw new Error(
          "SERPAPI_KEY is required for serpapi. Set it in argo-ts/.env, or use ARGO_SEARCH_PROVIDER=ddg for keyless search.",
        );
      }
      return new SerpapiProvider({ apiKey });
    }
    case "brave": {
      const apiKey = env.BRAVE_KEY;
      if (!apiKey) {
        throw new Error(
          "BRAVE_KEY is required for brave. Set it in argo-ts/.env, or use ARGO_SEARCH_PROVIDER=ddg for keyless search.",
        );
      }
      return new BraveProvider({ apiKey });
    }
    default:
      throw new Error(
        `Unknown ARGO_SEARCH_PROVIDER "${provider}". Use ddg, searxng, serpapi, or brave.`,
      );
  }
}

export type { SearchProvider, SearchResult } from "./interface.js";
