import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import { z } from "zod";
import type { Tool } from "./types.js";
import { assertPublicUrl } from "../net/ssrf-guard.js";
import { loadSettings } from "../settings/store.js";
import { shouldSkipPreflight } from "./webfetch-preflight.js";
import { resolveExtractProvider } from "../routing/extract.js";
import { runExtractPipeline, resolveExtractThresholds, resolveChunkSize, type Summarizer } from "./extract-pipeline.js";

const Args = z.object({ url: z.string().url() });

// A real browser UA avoids the trivial bot blocks many sites apply to fetch().
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TIMEOUT_MS = 15_000;
const MAX_OUTPUT = 80_000;
const TRUNCATED_MARKER = "\n\n…[truncated]";
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type FetchOk = { ok: true; res: Response };
type FetchErr = { ok: false; output: string };

/**
 * Fetch following redirects manually, re-validating every hop's target against
 * the SSRF guard before following it. This closes redirect/DNS-rebind SSRF: a
 * public URL that 30x-redirects to 169.254.169.254 or a LAN host is rejected.
 */
async function fetchGuarded(
  startUrl: string,
  signal: AbortSignal,
  skipPreflight = false,
): Promise<FetchOk | FetchErr> {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!skipPreflight) {
      const guard = await assertPublicUrl(url);
      if (!guard.ok) return { ok: false, output: `fetch blocked: ${guard.error}` };
    }
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      redirect: "manual",
      signal,
    });
    if (!REDIRECT_STATUSES.has(res.status)) return { ok: true, res };
    const location = res.headers.get("location");
    if (!location) return { ok: true, res }; // redirect w/o target → let caller handle
    url = new URL(location, url).href; // resolve relative redirects, re-guard next loop
  }
  return { ok: false, output: `fetch blocked: too many redirects (>${MAX_REDIRECTS})` };
}

/**
 * Extract readable article text from raw HTML using Readability, falling back
 * to the document body when the page is not an article.
 */
export function extractReadable(
  html: string,
  url: string,
): { title: string; text: string } {
  // linkedom's Document is structurally compatible with the DOM lib Document
  // Readability expects; the cast bridges the differing nominal types.
  const { document } = parseHTML(html);
  const article = new Readability(document as any).parse();
  if (article) {
    return {
      title: article.title ?? "",
      text: (article.textContent ?? "").trim(),
    };
  }
  return { title: "", text: document.body?.textContent?.trim() ?? "" };
}

function cap(text: string): string {
  if (text.length <= MAX_OUTPUT) return text;
  return text.slice(0, MAX_OUTPUT - TRUNCATED_MARKER.length) + TRUNCATED_MARKER;
}

// Per-session memo of URLs that failed, so a repeat web_fetch short-circuits
// instead of re-hitting a dead/blocked source. This is the deterministic fix for
// "spinning on a 404 / Cloudflare-blocked URL" — no skill or model cooperation
// needed. Cleared on process restart (a site that was down may be back up).
const failedUrls = new Map<string, string>();

/** Test hook: clear the failed-URL memo between cases. */
export function __resetWebFetchMemo(): void {
  failedUrls.clear();
}

/** Human-readable, retry-discouraging reason for a non-OK HTTP status. */
function classifyHttpFailure(status: number): string {
  if (status === 404 || status === 410) return `HTTP ${status} (page not found)`;
  if ([401, 403, 429, 503].includes(status))
    return `HTTP ${status} (blocked — likely Cloudflare/bot-protection or an auth wall)`;
  return `HTTP ${status}`;
}

// WEB-EXTRACT-PIPELINE: instead of blindly truncating a huge page, route the
// extracted text through the size-tiered pipeline (as-is / summarize /
// chunk+synthesize / refuse). The live summarizer resolves an (optionally
// separate, cheaper) auxiliary provider — see routing/extract.ts — so a big
// page's digest doesn't have to burn the main conversation model.
const SUMMARIZE_SYSTEM =
  "Summarize the following web page content concisely, preserving key facts, figures, and structure. " +
  "Do not add commentary about summarizing or mention that this is a summary.";

function liveSummarizer(env: NodeJS.ProcessEnv): Summarizer {
  return async (text, targetChars) => {
    const provider = resolveExtractProvider(env);
    const result = await provider.complete(
      [
        { role: "system", content: `${SUMMARIZE_SYSTEM} Target length: under ~${targetChars.toLocaleString()} characters.` },
        { role: "user", content: text },
      ],
      [],
    );
    return result.text;
  };
}

/** Memoize a failure and return a clear, non-retryable result for the model. */
function recordFailure(url: string, reason: string): { ok: false; output: string } {
  failedUrls.set(url, reason);
  return {
    ok: false,
    output:
      `fetch failed: ${reason}. ${url} is unavailable to automated fetch — ` +
      `do NOT retry it; ask the user to paste the content if you need it.`,
  };
}

export const webFetchTool: Tool = {
  schema: {
    name: "web_fetch",
    description:
      "Fetch a URL and return its main content as clean, readable text (markdown-ish). Strips nav, scripts, and boilerplate. " +
      "Large pages are size-tiered: small pages return as-is, large pages are summarized, huge pages are chunked and synthesized, and pages beyond a hard ceiling are refused with guidance to pick a more focused source.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The absolute URL to fetch" },
      },
      required: ["url"],
    },
  },
  describeForSafety: (a) => `fetch url ${String(a.url ?? "")}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'web_fetch needs a valid "url"' };
    }
    const { url } = parsed.data;
    const cached = failedUrls.get(url);
    if (cached) {
      return { ok: false, output: `skipped ${url} — it already failed this session (${cached}). Not retrying; paste the content if you need it.` };
    }
    const settings = await loadSettings(ctx.root, process.env);
    const skip = shouldSkipPreflight(settings, process.env);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const fetched = await fetchGuarded(url, controller.signal, skip);
      if (!fetched.ok) {
        failedUrls.set(url, fetched.output);
        return fetched;
      }
      const { res } = fetched;
      if (!res.ok) return recordFailure(url, classifyHttpFailure(res.status));
      const html = await res.text();
      const { title, text } = extractReadable(html, res.url || url);
      const body = title ? `# ${title}\n\n${text}` : text;
      const { tier, output } = await runExtractPipeline(body, {
        thresholds: resolveExtractThresholds(process.env),
        chunkSize: resolveChunkSize(process.env),
        summarize: liveSummarizer(process.env),
      });
      // cap() stays as an absolute backstop even past the pipeline (a misbehaving
      // summarizer that ignores the target length must never blow past the ceiling).
      return { ok: tier !== "refuse", output: cap(output) };
    } catch (err) {
      return recordFailure(url, `error: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  },
};
