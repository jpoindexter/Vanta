import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { resolveInScope } from "../scope.js";
import { extractDomain, isAllowedDomain } from "../browser/allowlist.js";
import { acquirePage, type Acquired } from "../browser/launch.js";

const Args = z.object({
  url: z.string().url(),
  path: z.string().min(1),
});

const NAV_TIMEOUT_MS = 30_000;

/** Capture a full-page PNG from an already-acquired page. Always closes it. */
async function capturePage(
  acquired: Acquired,
  url: string,
  abs: string,
  displayPath: string,
): Promise<ToolResult> {
  const page = acquired.page as unknown as {
    goto: (u: string, o: { timeout: number; waitUntil: "load" }) => Promise<unknown>;
    screenshot: (o: { path: string; fullPage: boolean }) => Promise<unknown>;
  };
  try {
    await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: "load" });
    await page.screenshot({ path: abs, fullPage: true });
    return { ok: true, output: `saved screenshot to ${displayPath}` };
  } catch (err) {
    return { ok: false, output: `could not screenshot ${url}: ${(err as Error).message}` };
  } finally {
    await acquired.close();
  }
}

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

    // Lazy import so Vanta loads even when playwright-core is absent.
    const { chromium } = await import("playwright-core");
    // Persistent profile when authed (reuses logins), else ephemeral. null on a
    // missing chromium binary preserves the prior graceful-degradation message.
    const acquired = await acquirePage(chromium, process.env, { headless: true }).catch(
      () => null,
    );
    if (acquired === null) {
      return {
        ok: false,
        output: "chromium not available — run: npx playwright install chromium",
      };
    }
    return capturePage(acquired, url, abs, path);
  },
};
