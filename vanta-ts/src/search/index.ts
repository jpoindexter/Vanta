import { DuckDuckGoProvider } from "./duckduckgo.js";
import { SearxngProvider } from "./searxng.js";
import { SerpapiProvider } from "./serpapi.js";
import { BraveProvider } from "./brave.js";
import { BingProvider } from "./bing.js";
import { JinaDdgProvider } from "./jina.js";
import { BraveBrowserProvider } from "./brave-browser.js";
import { ExaProvider } from "./exa.js";
import { FirecrawlProvider } from "./firecrawl.js";
import { TavilyProvider } from "./tavily.js";
import { ParallelProvider } from "./parallel.js";
import { XaiSearchProvider } from "./xai.js";
import type { SearchProvider } from "./interface.js";

/**
 * Resolve search providers from environment.
 *   VANTA_SEARCH_PROVIDER=auto    → configured reliable providers (default)
 *   VANTA_SEARCH_PROVIDER=searxng → self-hosted SearXNG (needs VANTA_SEARCH_URL)
 *   VANTA_SEARCH_PROVIDER=serpapi → SerpApi (needs SERPAPI_KEY)
 *   VANTA_SEARCH_PROVIDER=brave   → Brave Search API (needs BRAVE_KEY)
 *   VANTA_SEARCH_PROVIDER=xai     → xAI/Grok native live search (needs XAI_API_KEY)
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
  // Managed keyed backends first (highest-quality titled results + native domain
  // filtering / semantic recall), in the documented priority: Firecrawl → Parallel
  // → Tavily → Exa → Brave → SerpApi → SearXNG, then the keyless engines.
  if (env.FIRECRAWL_API_KEY) providers.push(new FirecrawlProvider({ apiKey: env.FIRECRAWL_API_KEY }));
  if (env.PARALLEL_API_KEY) providers.push(new ParallelProvider({ apiKey: env.PARALLEL_API_KEY }));
  if (env.TAVILY_API_KEY) providers.push(new TavilyProvider({ apiKey: env.TAVILY_API_KEY }));
  if (env.EXA_API_KEY) providers.push(new ExaProvider({ apiKey: env.EXA_API_KEY }));
  if (env.XAI_API_KEY) providers.push(new XaiSearchProvider({ apiKey: env.XAI_API_KEY, model: env.VANTA_XAI_SEARCH_MODEL }));
  if (env.BRAVE_KEY) providers.push(new BraveProvider({ apiKey: env.BRAVE_KEY }));
  if (env.SERPAPI_KEY) providers.push(new SerpapiProvider({ apiKey: env.SERPAPI_KEY }));
  if (env.VANTA_SEARCH_URL) providers.push(new SearxngProvider({ baseUrl: env.VANTA_SEARCH_URL }));
  // brave_browser is the keyless workhorse: a real chromium page reads Brave's
  // results where the raw-HTTP scrapers (DDG) get IP-403'd. Tried before the
  // (now mostly-broken) fetch scrapers, which stay as last-ditch fallbacks.
  providers.push(new BraveBrowserProvider());
  providers.push(new BingProvider());
  providers.push(new JinaDdgProvider());
  providers.push(new DuckDuckGoProvider());
  return providers;
}

/** Keyless providers (no env needed) — resolved by name without the keyed switch. */
const KEYLESS: Record<string, () => SearchProvider> = {
  ddg: () => new DuckDuckGoProvider(),
  bing: () => new BingProvider(),
  jina_ddg: () => new JinaDdgProvider(),
  brave_browser: () => new BraveBrowserProvider(),
};

/** Keyed providers — resolved by name from a required env var (data table keeps
 *  resolveNamedProvider under the complexity gate as backends grow). `env` is the
 *  var to read; `make` builds the provider from its value (+ the full env, for a
 *  provider like xai that reads a secondary override key). */
const KEYED: Record<string, { env: string; make: (value: string, env: NodeJS.ProcessEnv) => SearchProvider }> = {
  searxng: { env: "VANTA_SEARCH_URL", make: (baseUrl) => new SearxngProvider({ baseUrl }) },
  serpapi: { env: "SERPAPI_KEY", make: (apiKey) => new SerpapiProvider({ apiKey }) },
  brave: { env: "BRAVE_KEY", make: (apiKey) => new BraveProvider({ apiKey }) },
  exa: { env: "EXA_API_KEY", make: (apiKey) => new ExaProvider({ apiKey }) },
  firecrawl: { env: "FIRECRAWL_API_KEY", make: (apiKey) => new FirecrawlProvider({ apiKey }) },
  tavily: { env: "TAVILY_API_KEY", make: (apiKey) => new TavilyProvider({ apiKey }) },
  parallel: { env: "PARALLEL_API_KEY", make: (apiKey) => new ParallelProvider({ apiKey }) },
  xai: { env: "XAI_API_KEY", make: (apiKey, env) => new XaiSearchProvider({ apiKey, model: env.VANTA_XAI_SEARCH_MODEL }) },
};

const NAMED_HINT =
  "auto, firecrawl, tavily, parallel, exa, xai, brave_browser, searxng, serpapi, brave, bing, jina_ddg, or ddg";

function resolveNamedProvider(provider: string, env: NodeJS.ProcessEnv): SearchProvider {
  const keyless = KEYLESS[provider];
  if (keyless) return keyless();
  const keyed = KEYED[provider];
  if (!keyed) throw new Error(`Unknown VANTA_SEARCH_PROVIDER "${provider}". Use ${NAMED_HINT}.`);
  const value = env[keyed.env];
  if (!value) throw new Error(`${keyed.env} is required for ${provider}. Set it in vanta-ts/.env, or use VANTA_SEARCH_PROVIDER=auto.`);
  return keyed.make(value, env);
}

export type { SearchProvider, SearchResult } from "./interface.js";
