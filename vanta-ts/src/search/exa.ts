import type { SearchConfig, SearchProvider, SearchResult } from "./interface.js";
import { DEFAULT_MAX_RESULTS } from "./interface.js";

const REQUEST_TIMEOUT_MS = 12_000;
const SEARCH_URL = "https://api.exa.ai/search";
const SNIPPET_MAX_CHARS = 300;

/**
 * Exa neural/semantic search adapter (WEB-BACKEND-EXA). Embeddings-based recall
 * rather than keyword match — a different profile from the keyword scrapers. Exa
 * filters domains natively (includeDomains/excludeDomains), so it advertises
 * filtersDomains=true and the calling tool passes the scope through instead of a
 * site: rewrite. Requires EXA_API_KEY; throws on non-2xx (the tool catches).
 */
export class ExaProvider implements SearchProvider {
  readonly id = "exa";
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
        headers: { "Content-Type": "application/json", "x-api-key": this.apiKey },
        body: JSON.stringify(buildExaBody(query, config)),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Exa search failed: HTTP ${res.status}`);
      }
      const json: unknown = await res.json();
      return mapExaJson(json, max);
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Build the Exa /search request body. Maps our SearchConfig domain scope to Exa's
 * native includeDomains / excludeDomains, and always requests a short text snippet.
 * Pure + exported so the request shape is unit-tested without a network call.
 */
export function buildExaBody(query: string, config?: SearchConfig): Record<string, unknown> {
  const body: Record<string, unknown> = {
    query,
    numResults: config?.maxResults ?? DEFAULT_MAX_RESULTS,
    contents: { text: { maxCharacters: SNIPPET_MAX_CHARS } },
  };
  if (config?.allowedDomains?.length) body.includeDomains = config.allowedDomains;
  if (config?.excludedDomains?.length) body.excludeDomains = config.excludedDomains;
  return body;
}

type ExaEntry = { title?: unknown; url?: unknown; text?: unknown; highlights?: unknown; summary?: unknown };

/** First usable snippet from an Exa result: highlights → text → summary → "". */
function exaSnippet(entry: ExaEntry): string {
  const hl = Array.isArray(entry.highlights) ? entry.highlights.find((h) => typeof h === "string") : undefined;
  const raw = (typeof hl === "string" && hl) || (typeof entry.text === "string" && entry.text) || (typeof entry.summary === "string" && entry.summary) || "";
  const trimmed = raw.trim().replace(/\s+/g, " ");
  return trimmed.length > SNIPPET_MAX_CHARS ? `${trimmed.slice(0, SNIPPET_MAX_CHARS - 1)}…` : trimmed;
}

/**
 * Shape Exa's `{ results: [{ title, url, text, highlights, summary }] }` payload
 * into SearchResults. Pure + defensive: missing/non-array results → []; entries
 * lacking a title or url are skipped; output capped to `max`.
 */
export function mapExaJson(json: unknown, max: number): SearchResult[] {
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];

  const out: SearchResult[] = [];
  for (const raw of results) {
    if (out.length >= max) break;
    const entry = raw as ExaEntry;
    const title = typeof entry.title === "string" ? entry.title : "";
    const url = typeof entry.url === "string" ? entry.url : "";
    if (!title || !url) continue;
    out.push({ title, url, snippet: exaSnippet(entry) });
  }
  return out;
}
