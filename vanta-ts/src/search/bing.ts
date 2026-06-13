import { parseHTML } from "linkedom";
import {
  DEFAULT_MAX_RESULTS,
  type SearchConfig,
  type SearchProvider,
  type SearchResult,
} from "./interface.js";

const ENDPOINT = "https://www.bing.com/search";
const TIMEOUT_MS = 12_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type LinkedomNode = NonNullable<
  ReturnType<ReturnType<typeof parseHTML>["document"]["querySelector"]>
>;

/** Keyless Bing web search fallback. HTML is parsed defensively and may change. */
export class BingProvider implements SearchProvider {
  readonly id = "bing";

  async search(query: string, config?: SearchConfig): Promise<SearchResult[]> {
    const max = config?.maxResults ?? DEFAULT_MAX_RESULTS;
    const url = `${ENDPOINT}?q=${encodeURIComponent(query)}&count=${max}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) throw new Error(`Bing returned HTTP ${res.status} for "${query}"`);
    return parseBingHtml(await res.text(), max);
  }
}

/** Parse Bing result markup into SearchResult[]. Pure: no network, no I/O. */
export function parseBingHtml(html: string, max: number): SearchResult[] {
  const { document } = parseHTML(html);
  const out: SearchResult[] = [];
  for (const item of Array.from(document.querySelectorAll("li.b_algo")) as LinkedomNode[]) {
    if (out.length >= max) break;
    const anchor = item.querySelector("h2 a") ?? item.querySelector("a");
    const title = anchor?.textContent?.trim() ?? "";
    const url = normalizeBingUrl(anchor?.getAttribute("href") ?? "");
    if (!title || !url) continue;
    const snippet =
      item.querySelector(".b_caption p")?.textContent?.trim() ??
      item.querySelector("p")?.textContent?.trim() ??
      "";
    out.push({ title, url, snippet });
  }
  return out;
}

function normalizeBingUrl(raw: string): string {
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  return "";
}
