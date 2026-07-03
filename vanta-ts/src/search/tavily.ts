import type { SearchConfig, SearchProvider, SearchResult } from "./interface.js";
import { DEFAULT_MAX_RESULTS } from "./interface.js";

const REQUEST_TIMEOUT_MS = 12_000;
const SEARCH_URL = "https://api.tavily.com/search";

/**
 * Tavily managed search+extract backend (WEB-BACKENDS-MANAGED). Returns clean
 * titled results with content snippets and filters domains natively
 * (include_domains/exclude_domains), so filtersDomains=true. Requires
 * TAVILY_API_KEY (Bearer); throws on non-2xx (the calling tool catches).
 */
export class TavilyProvider implements SearchProvider {
  readonly id = "tavily";
  readonly filtersDomains = true;
  private readonly apiKey: string;

  constructor(opts: { apiKey: string }) {
    this.apiKey = opts.apiKey;
  }

  async search(query: string, config?: SearchConfig): Promise<SearchResult[]> {
    const max = config?.maxResults ?? DEFAULT_MAX_RESULTS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(SEARCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(buildTavilyBody(query, config)),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Tavily search failed: HTTP ${res.status}`);
      return mapTavilyJson(await res.json(), max);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Build the Tavily /search body; maps our domain scope to include/exclude_domains. */
export function buildTavilyBody(query: string, config?: SearchConfig): Record<string, unknown> {
  const body: Record<string, unknown> = { query, max_results: config?.maxResults ?? DEFAULT_MAX_RESULTS };
  if (config?.allowedDomains?.length) body.include_domains = config.allowedDomains;
  if (config?.excludedDomains?.length) body.exclude_domains = config.excludedDomains;
  return body;
}

type TavilyEntry = { title?: unknown; url?: unknown; content?: unknown };

/** Shape Tavily's `{ results: [{ title, url, content }] }` into SearchResults. */
export function mapTavilyJson(json: unknown, max: number): SearchResult[] {
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  const out: SearchResult[] = [];
  for (const raw of results) {
    if (out.length >= max) break;
    const entry = raw as TavilyEntry;
    const title = typeof entry.title === "string" ? entry.title : "";
    const url = typeof entry.url === "string" ? entry.url : "";
    if (!title || !url) continue;
    out.push({ title, url, snippet: typeof entry.content === "string" ? entry.content : "" });
  }
  return out;
}
