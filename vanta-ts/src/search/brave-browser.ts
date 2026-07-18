import { acquirePage, type Acquired } from "../browser/launch.js";
import type { SearchProvider, SearchResult, SearchConfig } from "./interface.js";
import { DEFAULT_MAX_RESULTS } from "./interface.js";

// KEYLESS web search by driving the REAL browser to Brave Search and reading the
// results page. The raw-HTTP scrapers (DuckDuckGo) get 403'd by IP; a real Chromium
// page is not blocked. It uses Playwright's browser when installed and otherwise
// the system Chrome/Brave/Edge/Chromium resolved by acquirePage. No API key.

const BRAVE_URL = "https://search.brave.com/search?q=";
// A real desktop UA — the default headless UA gets bot-blocked (returns 0 results).
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Runs IN the page (passed as a string so the Node tsconfig's missing DOM lib is a
// non-issue). Brave has used both `.snippet` and `.result-wrapper` containers;
// support both so a class-name rollout does not silently produce an empty search.
const EXTRACT_JS = `(() => {
  const out = [];
  for (const el of document.querySelectorAll('.snippet, .result-wrapper')) {
    const a = el.querySelector('a.l1[href^="http"], a[href^="http"]');
    if (!a) continue;
    const url = a.href;
    if (!url || url.indexOf('brave.com') !== -1) continue;
    const titleEl = el.querySelector('.search-snippet-title, .title') || a;
    const title = (titleEl.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!title) continue;
    const descEl = el.querySelector('.generic-snippet .content, .snippet-description, .snippet-content');
    let snippet = (descEl ? descEl.textContent : '') || '';
    if (!snippet) snippet = (el.textContent || '').split(title).join(' ');
    out.push({ title, url, snippet: snippet.replace(/\\s+/g, ' ').trim().slice(0, 240) });
  }
  return out;
})()`;

type RawRow = { title?: unknown; url?: unknown; snippet?: unknown };

/** Validate + shape one in-page row, or null when it's title/url-less or internal. */
function cleanRow(r: RawRow): SearchResult | null {
  const url = typeof r?.url === "string" ? r.url : "";
  const title = typeof r?.title === "string" ? r.title.trim() : "";
  if (!url || !title || url.includes("brave.com")) return null;
  return { title, url, snippet: typeof r?.snippet === "string" ? r.snippet.trim() : "" };
}

/** Shape the in-page rows into clean SearchResults: drop junk, dedupe by url, cap
 *  to `max`. Pure — the unit-tested core. */
export function mapBraveResults(raw: unknown, max: number): SearchResult[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const r of raw as RawRow[]) {
    const row = cleanRow(r);
    if (!row || seen.has(row.url)) continue;
    seen.add(row.url);
    out.push(row);
    if (out.length >= max) break;
  }
  return out;
}

/** The minimal page surface this provider drives (goto + evaluate-a-string). */
type SearchPage = {
  goto: (url: string, opts?: { timeout?: number; waitUntil?: "domcontentloaded" }) => Promise<unknown>;
  waitForSelector?: (selector: string, opts?: { timeout?: number }) => Promise<unknown>;
  waitForTimeout?: (ms: number) => Promise<void>;
  evaluate: (script: string) => Promise<unknown>;
};
type AcquireFn = (chromium: never, env: NodeJS.ProcessEnv, opts: { headless?: boolean; userAgent?: string }) => Promise<Acquired>;

export class BraveBrowserProvider implements SearchProvider {
  readonly id = "brave_browser";
  constructor(private deps: { acquire?: AcquireFn; chromium?: unknown } = {}) {}

  async search(query: string, config?: SearchConfig): Promise<SearchResult[]> {
    const max = config?.maxResults ?? DEFAULT_MAX_RESULTS;
    const acquire = this.deps.acquire ?? (acquirePage as unknown as AcquireFn);
    const chromium = (this.deps.chromium ?? (await import("playwright-core")).chromium) as never;
    const { page, close } = await acquire(chromium, process.env, { headless: true, userAgent: UA });
    try {
      const pg = page as unknown as SearchPage;
      await pg.goto(`${BRAVE_URL}${encodeURIComponent(query)}`, { timeout: 20000, waitUntil: "domcontentloaded" });
      await pg.waitForSelector?.(".result-wrapper, .snippet", { timeout: 8000 });
      await pg.waitForTimeout?.(200);
      return mapBraveResults(await pg.evaluate(EXTRACT_JS), max);
    } finally {
      await close();
    }
  }
}
