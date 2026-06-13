import {
  DEFAULT_MAX_RESULTS,
  type SearchConfig,
  type SearchProvider,
  type SearchResult,
} from "./interface.js";

const TIMEOUT_MS = 12_000;
const ENDPOINT = "https://r.jina.ai/http://html.duckduckgo.com/html/";

/** Keyless fallback: Jina Reader renders DDG HTML search as markdown. */
export class JinaDdgProvider implements SearchProvider {
  readonly id = "jina_ddg";

  async search(query: string, config?: SearchConfig): Promise<SearchResult[]> {
    const max = config?.maxResults ?? DEFAULT_MAX_RESULTS;
    const url = `${ENDPOINT}?q=${encodeURIComponent(query)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, { headers: { Accept: "text/plain" }, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) throw new Error(`Jina DDG returned HTTP ${res.status} for "${query}"`);
    return parseJinaDdgMarkdown(await res.text(), max);
  }
}

/** Parse Jina Reader's markdown links from a DDG result page. Pure: no network. */
export function parseJinaDdgMarkdown(markdown: string, max: number): SearchResult[] {
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  const linkPattern = /^## \[([^\]]+)]\((https?:\/\/[^)]+)\)$/gm;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(markdown)) && out.length < max) {
    const title = cleanTitle(match[1] ?? "");
    const url = normalizeUrl(match[2] ?? "");
    if (!title || !url || seen.has(url) || isJunk(url, title)) continue;
    seen.add(url);
    out.push({ title, url, snippet: snippetAfter(markdown, linkPattern.lastIndex) });
  }
  return out;
}

function cleanTitle(title: string): string {
  return title.replace(/\*\*/g, "").trim();
}

function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const uddg = url.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    return raw;
  } catch {
    return "";
  }
}

function isJunk(url: string, title: string): boolean {
  const lowerUrl = url.toLowerCase();
  const lowerTitle = title.toLowerCase();
  return lowerUrl.includes("duckduckgo.com/y.js") || lowerTitle.includes("duckduckgo") || lowerTitle.includes("feedback");
}

function snippetAfter(markdown: string, start: number): string {
  const next = markdown.slice(start).split("\n").map((line) => line.trim()).find((line) => line && !line.startsWith("[") && !line.startsWith("##"));
  return next?.replace(/^[-*>\s]+/, "").slice(0, 500) ?? "";
}
