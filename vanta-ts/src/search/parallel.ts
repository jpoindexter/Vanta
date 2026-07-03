import type { SearchConfig, SearchProvider, SearchResult } from "./interface.js";
import { DEFAULT_MAX_RESULTS } from "./interface.js";

const REQUEST_TIMEOUT_MS = 15_000;
const SEARCH_URL = "https://api.parallel.ai/v1/search";
const SNIPPET_MAX_CHARS = 300;

/**
 * Parallel managed search backend (WEB-BACKENDS-MANAGED). Distinct shape: an
 * `objective` + `search_queries` request returning ranked URLs with compressed
 * excerpts. No confirmed native domain filter, so filtersDomains is left false —
 * the calling tool applies a site: query rewrite instead. Auth is x-api-key.
 * (Live use may also need a `parallel-beta` header depending on API tier; kept
 * out per the current quickstart — a 4xx just degrades to the next provider.)
 */
export class ParallelProvider implements SearchProvider {
  readonly id = "parallel";
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
        headers: { "Content-Type": "application/json", "x-api-key": this.apiKey },
        body: JSON.stringify(buildParallelBody(query, max)),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Parallel search failed: HTTP ${res.status}`);
      return mapParallelJson(await res.json(), max);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Build the Parallel /v1/search body — the query is both the objective and the seed query. */
export function buildParallelBody(query: string, max: number): Record<string, unknown> {
  return { objective: query, search_queries: [query], max_results: max };
}

type ParallelEntry = { title?: unknown; url?: unknown; excerpts?: unknown };

/** First excerpt, trimmed to a snippet. */
function firstExcerpt(entry: ParallelEntry): string {
  const excerpt = Array.isArray(entry.excerpts) ? entry.excerpts.find((e) => typeof e === "string") : undefined;
  const raw = (typeof excerpt === "string" ? excerpt : "").trim().replace(/\s+/g, " ");
  return raw.length > SNIPPET_MAX_CHARS ? `${raw.slice(0, SNIPPET_MAX_CHARS - 1)}…` : raw;
}

/** Shape Parallel's `{ results: [{ title, url, excerpts }] }` into SearchResults. */
export function mapParallelJson(json: unknown, max: number): SearchResult[] {
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  const out: SearchResult[] = [];
  for (const raw of results) {
    if (out.length >= max) break;
    const entry = raw as ParallelEntry;
    const title = typeof entry.title === "string" ? entry.title : "";
    const url = typeof entry.url === "string" ? entry.url : "";
    if (!title || !url) continue;
    out.push({ title, url, snippet: firstExcerpt(entry) });
  }
  return out;
}
