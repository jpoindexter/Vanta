import { z } from "zod";
import type { Tool } from "./types.js";
import { resolveInScope } from "../scope.js";
import { extractDomain, isAllowedDomain } from "../browser/allowlist.js";

const Args = z.object({
  url: z.string().url(),
  path: z.string().min(1),
});

const NAV_TIMEOUT_MS = 30_000;

export const screenshotTool: Tool = {
  schema: {
    name: "screenshot",
    description:
      "Capture a full-page PNG screenshot of an approved URL, saving it to a path inside the project scope.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to screenshot" },
        path: {
          type: "string",
          description: "Path to save the .png, relative to the project root",
        },
      },
      required: ["url", "path"],
    },
  },
  // URL only — never page content, which can false-trigger the kernel.
  describeForSafety: (a) => `screenshot ${String(a.url ?? "")}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        output: 'screenshot needs a valid "url" and a "path" string',
      };
    }
    const { url, path } = parsed.data;

    const { ok, path: abs } = resolveInScope(path, ctx.root);
    if (!ok) {
      return {
        ok: false,
        output: `refused: path is outside project scope: ${path}`,
      };
    }

    if (!isAllowedDomain(url, process.env)) {
      const domain = extractDomain(url) ?? url;
      const approved = await ctx.requestApproval(
        `visit ${domain}`,
        "domain not on allowlist",
      );
      if (!approved) {
        return { ok: false, output: "denied" };
      }
    }

    // Lazy import so Argo loads even when playwright-core is absent.
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({ headless: true }).catch(() => null);
    if (browser === null) {
      return {
        ok: false,
        output: "chromium not available — run: npx playwright install chromium",
      };
    }
    try {
      const page = await browser.newPage();
      await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: "load" });
      await page.screenshot({ path: abs, fullPage: true });
      return { ok: true, output: `saved screenshot to ${path}` };
    } catch (err) {
      return {
        ok: false,
        output: `could not screenshot ${url}: ${(err as Error).message}`,
      };
    } finally {
      await browser.close();
    }
  },
};
