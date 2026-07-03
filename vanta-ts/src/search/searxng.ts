import {
  DEFAULT_MAX_RESULTS,
  type SearchConfig,
  type SearchProvider,
  type SearchResult,
} from "./interface.js";

const TIMEOUT_MS = 12_000;

/**
 * Self-hosted Searxng metasearch backend. Hits the JSON API; throws on a
 * non-2xx response or network/abort failure — the calling tool catches.
 */
export class SearxngProvider implements SearchProvider {
  readonly id = "searxng";
  private readonly baseUrl: string;

  constructor(opts: { baseUrl: string }) {
    // Trim trailing slash so the path join is predictable.
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
  }

  async search(query: string, config?: SearchConfig): Promise<SearchResult[]> {
    const max = config?.maxResults ?? DEFAULT_MAX_RESULTS;
    const url = buildSearxngUrl(this.baseUrl, query, config);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw new Error(`searxng search failed: HTTP ${res.status}`);
    }
    const json: unknown = await res.json();
    return mapSearxngJson(json, max);
  }
}

/**
 * Build the SearXNG JSON-API URL. WEB-SEARCH-CATEGORY-PAGINATION: SearXNG honors
 * `categories` (news/images/…) and 1-based `pageno` natively, so a category/page in
 * the config is passed through; unset → a plain first-page search (unchanged).
 */
export function buildSearxngUrl(baseUrl: string, query: string, config?: SearchConfig): string {
  const params = new URLSearchParams({ q: query, format: "json" });
  if (config?.category) params.set("categories", config.category);
  if (config?.page && config.page > 0) params.set("pageno", String(config.page));
  return `${baseUrl.replace(/\/+$/, "")}/search?${params.toString()}`;
}

/**
 * Shape Searxng's `{ results: [{ title, url, content }] }` JSON into
 * {@link SearchResult}s. Defensive: tolerates a missing/non-array `results`,
 * skips entries lacking a title or url, maps `content` to `snippet`, and caps
 * the output to `max`.
 */
export function mapSearxngJson(json: unknown, max: number): SearchResult[] {
  const results = (json as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];

  const out: SearchResult[] = [];
  for (const entry of results) {
    if (out.length >= max) break;
    const row = entry as { title?: unknown; url?: unknown; content?: unknown };
    const title = typeof row?.title === "string" ? row.title : "";
    const url = typeof row?.url === "string" ? row.url : "";
    if (!title || !url) continue;
    const snippet = typeof row?.content === "string" ? row.content : "";
    out.push({ title, url, snippet });
  }
  return out;
}
