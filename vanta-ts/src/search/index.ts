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
 *   VANTA_SEARCH_PROVIDER=jina_ddg → Jina Reader over DuckDuckGo HTML (explicit legacy fallback)
 *   VANTA_SEARCH_PROVIDER=ddg     → DuckDuckGo HTML scrape (explicit fallback only)
 */
/** WEB-BACKEND-SPLIT — a web capability can target its OWN backend. */
export type WebCapability = "search" | "extract";

/**
 * The provider id for a capability: its per-capability override
 * (VANTA_SEARCH_BACKEND / VANTA_EXTRACT_BACKEND) if set, else the shared
 * VANTA_SEARCH_PROVIDER, else "auto". So cheap/keyless search + high-quality
 * extract can run at once, while a single VANTA_SEARCH_PROVIDER still drives
 * both (back-compatible). Pure.
 */
export function backendIdFor(env: NodeJS.ProcessEnv, capability: WebCapability): string {
  const perCap = capability === "extract" ? env.VANTA_EXTRACT_BACKEND : env.VANTA_SEARCH_BACKEND;
  return (perCap ?? env.VANTA_SEARCH_PROVIDER ?? "auto").toLowerCase();
}

/**
 * Resolve the ordered providers for a web capability (default "search"). Reads
 * the capability's backend id (see backendIdFor); "auto" fans out the priority
 * chain, a named id resolves that one provider.
 */
export function resolveSearchProviders(env: NodeJS.ProcessEnv, capability: WebCapability = "search"): SearchProvider[] {
  const provider = backendIdFor(env, capability);
  if (provider === "auto") return resolveAutoProviders(env);
  return [resolveNamedProvider(provider, env)];
}

export function resolveSearchProvider(env: NodeJS.ProcessEnv, capability: WebCapability = "search"): SearchProvider {
  return resolveSearchProviders(env, capability)[0] as SearchProvider;
}

function resolveAutoProviders(env: NodeJS.ProcessEnv): SearchProvider[] {
  // Keyed providers first, then browser-backed/keyless engines. DDG-derived
  // providers are intentionally absent: their bot gates make them unsuitable
  // for automatic agent routing. They remain available by explicit name only.
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
  // brave_browser is the keyless workhorse: a real Chromium page reads Brave's
  // results where raw-HTTP scrapers are commonly blocked.
  providers.push(new BraveBrowserProvider());
  providers.push(new BingProvider());
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
