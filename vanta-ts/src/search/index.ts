import { DuckDuckGoProvider } from "./duckduckgo.js";
import { SearxngProvider } from "./searxng.js";
import { SerpapiProvider } from "./serpapi.js";
import { BraveProvider } from "./brave.js";
import { BingProvider } from "./bing.js";
import { JinaDdgProvider } from "./jina.js";
import type { SearchProvider } from "./interface.js";

/**
 * Resolve search providers from environment.
 *   VANTA_SEARCH_PROVIDER=auto    → configured reliable providers (default)
 *   VANTA_SEARCH_PROVIDER=searxng → self-hosted SearXNG (needs VANTA_SEARCH_URL)
 *   VANTA_SEARCH_PROVIDER=serpapi → SerpApi (needs SERPAPI_KEY)
 *   VANTA_SEARCH_PROVIDER=brave   → Brave Search API (needs BRAVE_KEY)
 *   VANTA_SEARCH_PROVIDER=bing    → Bing HTML scrape (keyless fallback)
 *   VANTA_SEARCH_PROVIDER=jina_ddg → Jina Reader over DuckDuckGo HTML (keyless fallback)
 *   VANTA_SEARCH_PROVIDER=ddg     → DuckDuckGo HTML scrape (explicit fallback only)
 */
export function resolveSearchProviders(env: NodeJS.ProcessEnv): SearchProvider[] {
  const provider = (env.VANTA_SEARCH_PROVIDER ?? "auto").toLowerCase();
  if (provider === "auto") return resolveAutoProviders(env);
  return [resolveNamedProvider(provider, env)];
}

export function resolveSearchProvider(env: NodeJS.ProcessEnv): SearchProvider {
  return resolveSearchProviders(env)[0] as SearchProvider;
}

function resolveAutoProviders(env: NodeJS.ProcessEnv): SearchProvider[] {
  // Keyed providers first (more reliable), then keyless DDG as the always-present
  // fallback so search works out-of-the-box with zero config. web_search tries each
  // in order and only fails if ALL error — so a flaky DDG day degrades, not breaks.
  const providers: SearchProvider[] = [];
  if (env.BRAVE_KEY) providers.push(new BraveProvider({ apiKey: env.BRAVE_KEY }));
  if (env.SERPAPI_KEY) providers.push(new SerpapiProvider({ apiKey: env.SERPAPI_KEY }));
  if (env.VANTA_SEARCH_URL) providers.push(new SearxngProvider({ baseUrl: env.VANTA_SEARCH_URL }));
  providers.push(new BingProvider());
  providers.push(new JinaDdgProvider());
  providers.push(new DuckDuckGoProvider());
  return providers;
}

function resolveNamedProvider(provider: string, env: NodeJS.ProcessEnv): SearchProvider {
  switch (provider) {
    case "ddg":
      return new DuckDuckGoProvider();
    case "bing":
      return new BingProvider();
    case "jina_ddg":
      return new JinaDdgProvider();
    case "searxng": {
      const baseUrl = env.VANTA_SEARCH_URL;
      if (!baseUrl) throw new Error("VANTA_SEARCH_URL is required for searxng. Set it in vanta-ts/.env (e.g. http://localhost:8080).");
      return new SearxngProvider({ baseUrl });
    }
    case "serpapi": {
      const apiKey = env.SERPAPI_KEY;
      if (!apiKey) throw new Error("SERPAPI_KEY is required for serpapi. Set it in vanta-ts/.env, or use VANTA_SEARCH_PROVIDER=auto.");
      return new SerpapiProvider({ apiKey });
    }
    case "brave": {
      const apiKey = env.BRAVE_KEY;
      if (!apiKey) throw new Error("BRAVE_KEY is required for brave. Set it in vanta-ts/.env, or use VANTA_SEARCH_PROVIDER=auto.");
      return new BraveProvider({ apiKey });
    }
    default:
      throw new Error(`Unknown VANTA_SEARCH_PROVIDER "${provider}". Use auto, searxng, serpapi, brave, bing, jina_ddg, or ddg.`);
  }
}

export type { SearchProvider, SearchResult } from "./interface.js";
