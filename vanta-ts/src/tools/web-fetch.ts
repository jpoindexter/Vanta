import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import { z } from "zod";
import type { Tool } from "./types.js";

const Args = z.object({ url: z.string().url() });

// A real browser UA avoids the trivial bot blocks many sites apply to fetch().
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TIMEOUT_MS = 15_000;
const MAX_OUTPUT = 80_000;
const TRUNCATED_MARKER = "\n\n…[truncated]";

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

export const webFetchTool: Tool = {
  schema: {
    name: "web_fetch",
    description:
      "Fetch a URL and return its main content as clean, readable text (markdown-ish). Strips nav, scripts, and boilerplate.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The absolute URL to fetch" },
      },
      required: ["url"],
    },
  },
  describeForSafety: (a) => `fetch url ${String(a.url ?? "")}`,
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'web_fetch needs a valid "url"' };
    }
    const { url } = parsed.data;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { "user-agent": USER_AGENT },
        signal: controller.signal,
      });
      if (!res.ok) {
        return { ok: false, output: `fetch failed: HTTP ${res.status}` };
      }
      const html = await res.text();
      const { title, text } = extractReadable(html, url);
      const body = title ? `# ${title}\n\n${text}` : text;
      return { ok: true, output: cap(body) };
    } catch (err) {
      return { ok: false, output: `fetch failed: ${(err as Error).message}` };
    } finally {
      clearTimeout(timer);
    }
  },
};
