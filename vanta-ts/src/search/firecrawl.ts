import type { SearchConfig, SearchProvider, SearchResult } from "./interface.js";
import { DEFAULT_MAX_RESULTS } from "./interface.js";

const REQUEST_TIMEOUT_MS = 15_000;
const SEARCH_URL = "https://api.firecrawl.dev/v2/search";

/**
 * Firecrawl managed search+extract backend (WEB-BACKENDS-MANAGED). Returns titled
 * web results (title/description/url) and filters domains natively
 * (includeDomains/excludeDomains, mutually exclusive), so filtersDomains=true.
 * Requires FIRECRAWL_API_KEY (Bearer); throws on non-2xx (the tool catches).
 */
export class FirecrawlProvider implements SearchProvider {
  readonly id = "firecrawl";
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
        body: JSON.stringify(buildFirecrawlBody(query, config)),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Firecrawl search failed: HTTP ${res.status}`);
      return mapFirecrawlJson(await res.json(), max);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Build the Firecrawl /v2/search body; maps our domain scope to include/excludeDomains. */
export function buildFirecrawlBody(query: string, config?: SearchConfig): Record<string, unknown> {
  const body: Record<string, unknown> = { query, limit: config?.maxResults ?? DEFAULT_MAX_RESULTS };
  if (config?.allowedDomains?.length) body.includeDomains = config.allowedDomains;
  if (config?.excludedDomains?.length) body.excludeDomains = config.excludedDomains;
  return body;
}

type FirecrawlEntry = { title?: unknown; url?: unknown; description?: unknown };

/** Shape Firecrawl's `{ data: { web: [{ title, url, description }] } }` into SearchResults. */
export function mapFirecrawlJson(json: unknown, max: number): SearchResult[] {
  const web = (json as { data?: { web?: unknown } } | null)?.data?.web;
  if (!Array.isArray(web)) return [];
  const out: SearchResult[] = [];
  for (const raw of web) {
    if (out.length >= max) break;
    const entry = raw as FirecrawlEntry;
    const title = typeof entry.title === "string" ? entry.title : "";
    const url = typeof entry.url === "string" ? entry.url : "";
    if (!title || !url) continue;
    out.push({ title, url, snippet: typeof entry.description === "string" ? entry.description : "" });
  }
  return out;
}
