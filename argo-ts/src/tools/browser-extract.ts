import { parseHTML } from "linkedom";
import { z } from "zod";
import type { Tool } from "./types.js";
import { isAllowedDomain } from "../browser/allowlist.js";

const What = z.enum(["text", "links", "tables"]).default("text");
const Args = z.object({ url: z.string().url(), what: What });

const TIMEOUT_MS = 30_000;

/**
 * Minimal structural view of a linkedom element. The Node-side tsconfig has no
 * DOM lib, and linkedom types `querySelectorAll` results as `unknown`, so we
 * declare just the members we read.
 */
type ExtractNode = {
  textContent: string | null;
  getAttribute: (name: string) => string | null;
  querySelectorAll: (selector: string) => Iterable<ExtractNode>;
};

/**
 * Extract structured content from raw HTML. Pure and dependency-light:
 * - "text"   → the body's text content, whitespace-trimmed
 * - "links"  → one "text — href" line per anchor with an href
 * - "tables" → each table rendered as TSV rows, blank line between tables
 */
export function extractFromHtml(
  html: string,
  what: "text" | "links" | "tables",
): string {
  const { document } = parseHTML(html);

  if (what === "links") {
    const anchors = Array.from(
      document.querySelectorAll("a[href]"),
    ) as ExtractNode[];
    return anchors
      .map((a) => {
        const text = (a.textContent ?? "").trim().replace(/\s+/g, " ");
        const href = a.getAttribute("href") ?? "";
        return `${text} — ${href}`;
      })
      .join("\n");
  }

  if (what === "tables") {
    const tables = Array.from(document.querySelectorAll("table")) as ExtractNode[];
    return tables
      .map((table) => {
        const rows = Array.from(table.querySelectorAll("tr")) as ExtractNode[];
        return rows
          .map((row) => {
            const cells = Array.from(
              row.querySelectorAll("th, td"),
            ) as ExtractNode[];
            return cells
              .map((c) => (c.textContent ?? "").trim().replace(/\s+/g, " "))
              .join("\t");
          })
          .join("\n");
      })
      .join("\n\n");
  }

  return (document.body?.textContent ?? "").trim().replace(/\s+/g, " ");
}

export const browserExtractTool: Tool = {
  schema: {
    name: "browser_extract",
    description:
      "Load a URL in a headless browser and extract its text, links, or tables. Domains outside the allowlist require approval.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The absolute URL to load" },
        what: {
          type: "string",
          enum: ["text", "links", "tables"],
          description: "What to extract (default: text)",
        },
      },
      required: ["url"],
    },
  },
  describeForSafety: (a) => `extract from ${String(a.url ?? "")}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'browser_extract needs a valid "url"' };
    }
    const { url, what } = parsed.data;

    if (!isAllowedDomain(url)) {
      const approved = await ctx.requestApproval(
        `Load ${url} in a headless browser`,
        "domain is not in the VANTA_ALLOWED_DOMAINS allowlist",
      );
      if (!approved) {
        return { ok: false, output: "denied by user" };
      }
    }

    // Lazy so Argo loads even when playwright-core is absent/uninstalled.
    let chromium: typeof import("playwright-core").chromium;
    try {
      ({ chromium } = await import("playwright-core"));
    } catch {
      return {
        ok: false,
        output:
          "playwright-core is not installed — run `npm i playwright-core` and `npx playwright install chromium`",
      };
    }

    try {
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        await page.goto(url, { timeout: TIMEOUT_MS, waitUntil: "load" });
        const html = await page.content();
        return { ok: true, output: extractFromHtml(html, what) };
      } finally {
        await browser.close();
      }
    } catch (err) {
      return {
        ok: false,
        output: `browser_extract failed: ${(err as Error).message}`,
      };
    }
  },
};
