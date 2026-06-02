import { parseHTML } from "linkedom";
import {
  DEFAULT_MAX_RESULTS,
  type SearchConfig,
  type SearchProvider,
  type SearchResult,
} from "./interface.js";

const ENDPOINT = "https://html.duckduckgo.com/html/";
const TIMEOUT_MS = 12_000;
// DDG's lite HTML endpoint rejects non-browser agents; a desktop UA gets results.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

/** A linkedom element node, derived from its API so no DOM-lib globals leak in. */
type LinkedomNode = NonNullable<
  ReturnType<ReturnType<typeof parseHTML>["document"]["querySelector"]>
>;

/** DuckDuckGo HTML scraper. No API key required; parses the lite HTML SERP. */
export class DuckDuckGoProvider implements SearchProvider {
  readonly id = "ddg";

  async search(query: string, config?: SearchConfig): Promise<SearchResult[]> {
    const max = config?.maxResults ?? DEFAULT_MAX_RESULTS;
    const url = `${ENDPOINT}?q=${encodeURIComponent(query)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`DuckDuckGo returned HTTP ${res.status} for "${query}"`);
      }
      const html = await res.text();
      return parseDdgHtml(html, max);
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Parse DuckDuckGo HTML SERP markup into results. Pure: no network, no I/O.
 * Decodes the `uddg` redirect param when present, else normalizes the raw href.
 */
export function parseDdgHtml(html: string, max: number): SearchResult[] {
  const { document } = parseHTML(html);
  const anchors = Array.from(
    document.querySelectorAll("a.result__a"),
  ) as LinkedomNode[];
  const results: SearchResult[] = [];

  for (const anchor of anchors) {
    if (results.length >= max) break;
    const title = (anchor.textContent ?? "").trim();
    const url = resolveUrl(anchor.getAttribute("href"));
    if (!title || !url) continue;
    results.push({ title, url, snippet: extractSnippet(anchor) });
  }

  return results;
}

/** Resolve a DDG result href to a real URL, unwrapping the `uddg` redirect. */
function resolveUrl(href: string | null): string {
  if (!href) return "";
  const raw = href.trim();
  if (!raw) return "";
  const uddg = readUddgParam(raw);
  if (uddg) return uddg;
  return raw.startsWith("//") ? `https:${raw}` : raw;
}

/** Extract the decoded `uddg` query param from a DDG redirect href, if any. */
function readUddgParam(href: string): string {
  const match = href.match(/[?&]uddg=([^&]+)/);
  if (!match || !match[1]) return "";
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return "";
  }
}

/** Find the snippet text associated with a result anchor. */
function extractSnippet(anchor: LinkedomNode): string {
  // The snippet lives in a sibling subtree; scope the lookup to the result block.
  const block = anchor.closest(".result") ?? anchor.parentElement;
  const snippet = block?.querySelector(".result__snippet");
  return (snippet?.textContent ?? "").trim();
}
