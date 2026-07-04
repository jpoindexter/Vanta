import type { SearchConfig, SearchProvider, SearchResult } from "./interface.js";
import { DEFAULT_MAX_RESULTS } from "./interface.js";

const REQUEST_TIMEOUT_MS = 90_000; // xAI's own live-search call is itself agentic/multi-step — longer than a plain REST search
const RESPONSES_URL = "https://api.x.ai/v1/responses";
const DEFAULT_MODEL = "grok-4.3";
const MAX_DOMAINS = 5; // xAI's own cap, stricter than the shared WEB-DOMAIN-SCOPING cap of 10

/**
 * xAI/Grok native live search (WEB-BACKEND-XAI-GROK). A fundamentally different
 * shape from every other backend here: instead of a REST search index, a
 * reasoning model performs the search itself and returns ONE grounded answer
 * with inline citations — verified against the real /v1/responses API (a
 * documented OpenClaw integration bug — github.com/openclaw/openclaw#13171 —
 * confirms the response has NO top-level output_text/citations field; the
 * real path is output[].content[].annotations on the message's output_text
 * block). Each citation annotation carries {title, url, start_index,
 * end_index}, which maps directly onto SearchResult — the cited span of the
 * answer becomes the snippet. filtersDomains=true: xAI filters natively via
 * the request's `filters` field. Auth via XAI_API_KEY.
 */
export class XaiSearchProvider implements SearchProvider {
  readonly id = "xai";
  readonly filtersDomains = true;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(opts: { apiKey: string; model?: string }) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? DEFAULT_MODEL;
  }

  async search(query: string, config?: SearchConfig): Promise<SearchResult[]> {
    const domainError = validateXaiDomains(config);
    if (domainError) throw new Error(domainError);
    const max = config?.maxResults ?? DEFAULT_MAX_RESULTS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(RESPONSES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(buildXaiBody(query, this.model, config)),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`xAI search failed: HTTP ${res.status}`);
      return mapXaiResponse(await res.json(), max);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** xAI caps allowed/excluded domains at 5 each (stricter than the shared cap). */
export function validateXaiDomains(config?: SearchConfig): string | null {
  const allowed = config?.allowedDomains ?? [];
  const excluded = config?.excludedDomains ?? [];
  // Defense-in-depth: web_search already enforces mutual exclusivity upstream
  // (search/scope.ts validateDomainScope) before any provider is reached, but a
  // caller that talks to XaiSearchProvider directly must still get the same
  // guarantee — xAI's own API rejects a request carrying both.
  if (allowed.length && excluded.length) return "xai: allowed_domains and excluded_domains are mutually exclusive — pass only one.";
  if (allowed.length > MAX_DOMAINS) return `xai: allowed_domains is capped at ${MAX_DOMAINS} (got ${allowed.length})`;
  if (excluded.length > MAX_DOMAINS) return `xai: excluded_domains is capped at ${MAX_DOMAINS} (got ${excluded.length})`;
  return null;
}

/** Build the /v1/responses request body; domain filters nest under `filters` (verified shape). */
export function buildXaiBody(query: string, model: string, config?: SearchConfig): Record<string, unknown> {
  const tool: Record<string, unknown> = { type: "web_search" };
  if (config?.allowedDomains?.length) tool.filters = { allowed_domains: config.allowedDomains };
  else if (config?.excludedDomains?.length) tool.filters = { excluded_domains: config.excludedDomains };
  return { model, input: [{ role: "user", content: query }], tools: [tool] };
}

type XaiAnnotation = { title?: unknown; url?: unknown; start_index?: unknown; end_index?: unknown };
type XaiContentBlock = { type?: unknown; text?: unknown; annotations?: unknown };
type XaiOutputItem = { type?: unknown; content?: unknown };

/** Find the message's output_text content block. Real shape (verified, not the
 *  naive top-level output_text/citations OpenClaw's integration wrongly assumed). */
function findOutputTextBlock(json: unknown): XaiContentBlock | null {
  const output = (json as { output?: unknown } | null)?.output;
  if (!Array.isArray(output)) return null;
  for (const item of output as XaiOutputItem[]) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    const block = (item.content as XaiContentBlock[]).find((b) => b?.type === "output_text");
    if (block) return block;
  }
  return null;
}

/** One annotation → SearchResult, or null when it lacks a title/url. */
function annotationToResult(a: XaiAnnotation, text: string): SearchResult | null {
  const title = typeof a.title === "string" ? a.title : "";
  const url = typeof a.url === "string" ? a.url : "";
  if (!title || !url) return null;
  const start = typeof a.start_index === "number" ? a.start_index : 0;
  const end = typeof a.end_index === "number" ? a.end_index : start;
  return { title, url, snippet: text.slice(start, end) };
}

/**
 * Shape the response's citation annotations into SearchResults: each
 * annotation's {title, url} pairs with the cited span of the answer text
 * (start_index..end_index) as the snippet. Skips title/url-less annotations,
 * caps to max, tolerant of malformed/missing structure.
 */
export function mapXaiResponse(json: unknown, max: number): SearchResult[] {
  const block = findOutputTextBlock(json);
  const text = typeof block?.text === "string" ? block.text : "";
  const annotations = Array.isArray(block?.annotations) ? (block!.annotations as XaiAnnotation[]) : [];
  return annotations.map((a) => annotationToResult(a, text)).filter((r): r is SearchResult => r !== null).slice(0, max);
}
