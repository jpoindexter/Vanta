import { parseHTML } from "linkedom";
import {
  DEFAULT_MAX_RESULTS,
  type SearchConfig,
  type SearchProvider,
  type SearchResult,
} from "./interface.js";

const HTML_ENDPOINT = "https://html.duckduckgo.com/html/";
const LITE_ENDPOINT = "https://lite.duckduckgo.com/lite/";
const TIMEOUT_MS = 12_000;
// A COMPLETE desktop UA — the prior truncated string (no Chrome/Safari suffix)
// reads as a bot and DDG answers 403. The Accept headers + POST form body below
// mirror a real browser submit, which is what gets past the gate.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Content-Type": "application/x-www-form-urlencoded",
  Referer: "https://duckduckgo.com/",
  Origin: "https://duckduckgo.com",
};

/** A linkedom element node, derived from its API so no DOM-lib globals leak in. */
type LinkedomNode = NonNullable<
  ReturnType<ReturnType<typeof parseHTML>["document"]["querySelector"]>
>;

const IA_ENDPOINT = "https://api.duckduckgo.com/";

/**
 * DuckDuckGo, keyless. Primary path is the OFFICIAL Instant-Answer JSON API
 * (api.duckduckgo.com) — it is not bot-gated and returns 200 where the HTML
 * SERP scrape now answers 403 (DDG IP-blocks scrapers). When the IA API yields
 * nothing (it only covers entity/abstract queries), it falls back to scraping
 * the `html` then `lite` SERPs, which still work from non-blocked networks.
 */
export class DuckDuckGoProvider implements SearchProvider {
  readonly id = "ddg";

  async search(query: string, config?: SearchConfig): Promise<SearchResult[]> {
    const max = config?.maxResults ?? DEFAULT_MAX_RESULTS;
    // 1. Official JSON API — keyless, never bot-gated.
    const ia = await fetchInstantAnswers(query).then((j) => parseInstantAnswers(j, max)).catch(() => []);
    if (ia.length > 0) return ia;
    // 2. HTML SERP scrape (works on non-blocked IPs); html → lite fallback.
    try {
      const results = parseDdgHtml(await fetchSerp(HTML_ENDPOINT, query), max);
      if (results.length > 0) return results;
    } catch {
      /* fall through to lite */
    }
    return parseDdgLiteHtml(await fetchSerp(LITE_ENDPOINT, query), max);
  }
}

/** One raw Instant-Answer related-topic node (may itself nest a `Topics` group). */
type IaTopic = { Text?: string; FirstURL?: string; Topics?: IaTopic[] };
type IaResponse = { Heading?: string; AbstractText?: string; AbstractURL?: string; RelatedTopics?: IaTopic[] };

/** GET the DuckDuckGo Instant-Answer JSON for a query, or throw on a bad status. */
async function fetchInstantAnswers(query: string): Promise<IaResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${IA_ENDPOINT}?q=${encodeURIComponent(query)}&format=json&no_html=1&no_redirect=1&skip_disambig=1`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: controller.signal });
    if (!res.ok) throw new Error(`DuckDuckGo IA returned HTTP ${res.status} for "${query}"`);
    return (await res.json()) as IaResponse;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Map a DuckDuckGo Instant-Answer payload into SearchResult[]. Pure: no network.
 * The abstract (if any) leads, then each related topic (nested groups flattened).
 */
export function parseInstantAnswers(json: IaResponse, max: number): SearchResult[] {
  const results: SearchResult[] = [];
  if (json.AbstractText && json.AbstractURL) {
    results.push({ title: json.Heading || json.AbstractText, url: json.AbstractURL, snippet: json.AbstractText });
  }
  for (const topic of flattenTopics(json.RelatedTopics ?? [])) {
    if (results.length >= max) break;
    if (!topic.FirstURL || !topic.Text) continue;
    results.push({ title: topic.Text.split(" - ")[0]!.trim(), url: topic.FirstURL, snippet: topic.Text });
  }
  return results.slice(0, max);
}

/** Flatten DDG related-topics, which nest one level deep under `Topics`. */
function flattenTopics(topics: IaTopic[]): IaTopic[] {
  const flat: IaTopic[] = [];
  for (const t of topics) {
    if (Array.isArray(t.Topics)) flat.push(...t.Topics);
    else flat.push(t);
  }
  return flat;
}

/** POST a query to a DDG SERP endpoint and return the HTML body, or throw. */
async function fetchSerp(endpoint: string, query: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: BROWSER_HEADERS,
      body: `q=${encodeURIComponent(query)}&kl=us-en`,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`DuckDuckGo returned HTTP ${res.status} for "${query}"`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse the `lite.duckduckgo.com` SERP. Pure: no network. The lite page lays
 * results out as a table — each result is an `a.result-link`, its snippet in a
 * following `.result-snippet` cell (positional pairing by index).
 */
export function parseDdgLiteHtml(html: string, max: number): SearchResult[] {
  const { document } = parseHTML(html);
  const anchors = Array.from(document.querySelectorAll("a.result-link")) as LinkedomNode[];
  const snippets = Array.from(document.querySelectorAll(".result-snippet")) as LinkedomNode[];
  const results: SearchResult[] = [];

  for (let i = 0; i < anchors.length; i++) {
    if (results.length >= max) break;
    const anchor = anchors[i]!;
    const title = (anchor.textContent ?? "").trim();
    const url = resolveUrl(anchor.getAttribute("href"));
    if (!title || !url) continue;
    results.push({ title, url, snippet: (snippets[i]?.textContent ?? "").trim() });
  }

  return results;
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
