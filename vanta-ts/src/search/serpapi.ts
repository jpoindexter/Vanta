import {
  DEFAULT_MAX_RESULTS,
  type SearchConfig,
  type SearchProvider,
  type SearchResult,
} from "./interface.js";

const ENDPOINT = "https://serpapi.com/search.json";
const TIMEOUT_MS = 12_000;

/** Google search via SerpAPI. Requires an API key. MAY throw — caller catches. */
export class SerpapiProvider implements SearchProvider {
  readonly id = "serpapi";
  private readonly apiKey: string;

  constructor(opts: { apiKey: string }) {
    this.apiKey = opts.apiKey;
  }

  async search(query: string, config?: SearchConfig): Promise<SearchResult[]> {
    const max = config?.maxResults ?? DEFAULT_MAX_RESULTS;
    const url =
      `${ENDPOINT}?engine=google&q=${encodeURIComponent(query)}` +
      `&num=${max}&api_key=${encodeURIComponent(this.apiKey)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw new Error(`SerpAPI request failed: ${res.status} ${res.statusText}`);
    }
    const json: unknown = await res.json();
    return mapSerpapiJson(json, max);
  }
}

/**
 * Shape SerpAPI's `{ organic_results: [{ title, link, snippet }] }` into
 * {@link SearchResult}[]. Defensive: skips entries missing title or link,
 * caps to `max`, returns [] for any non-conforming input.
 */
export function mapSerpapiJson(json: unknown, max: number): SearchResult[] {
  if (typeof json !== "object" || json === null) return [];
  const organic = (json as { organic_results?: unknown }).organic_results;
  if (!Array.isArray(organic)) return [];

  const results: SearchResult[] = [];
  for (const entry of organic) {
    if (results.length >= max) break;
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const title = typeof e.title === "string" ? e.title : "";
    const url = typeof e.link === "string" ? e.link : "";
    if (!title || !url) continue;
    const snippet = typeof e.snippet === "string" ? e.snippet : "";
    results.push({ title, url, snippet });
  }
  return results;
}
