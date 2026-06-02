import type {
  SearchConfig,
  SearchProvider,
  SearchResult,
} from "./interface.js";
import { DEFAULT_MAX_RESULTS } from "./interface.js";

const REQUEST_TIMEOUT_MS = 12_000;

/** Brave Search API adapter. Requires a subscription token. */
export class BraveProvider implements SearchProvider {
  readonly id = "brave";
  private readonly apiKey: string;

  constructor(opts: { apiKey: string }) {
    this.apiKey = opts.apiKey;
  }

  async search(query: string, config?: SearchConfig): Promise<SearchResult[]> {
    const max = config?.maxResults ?? DEFAULT_MAX_RESULTS;
    const url =
      "https://api.search.brave.com/res/v1/web/search" +
      `?q=${encodeURIComponent(query)}&count=${max}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": this.apiKey,
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Brave search failed: HTTP ${res.status}`);
      }
      const json: unknown = await res.json();
      return mapBraveJson(json, max);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Minimal shape of a Brave web result; remote fields are not trusted. */
type BraveEntry = { title?: unknown; url?: unknown; description?: unknown };

/**
 * Shape Brave's `{ web: { results: [...] } }` payload into SearchResults.
 * Pure and defensive: missing `web`/`results` yields []; entries lacking a
 * title or url are skipped; output is capped to `max`.
 */
export function mapBraveJson(json: unknown, max: number): SearchResult[] {
  const results = (json as { web?: { results?: unknown } } | null)?.web
    ?.results;
  if (!Array.isArray(results)) return [];

  const out: SearchResult[] = [];
  for (const raw of results) {
    if (out.length >= max) break;
    const entry = raw as BraveEntry;
    const title = typeof entry.title === "string" ? entry.title : "";
    const url = typeof entry.url === "string" ? entry.url : "";
    if (!title || !url) continue;
    const snippet =
      typeof entry.description === "string" ? entry.description : "";
    out.push({ title, url, snippet });
  }
  return out;
}
