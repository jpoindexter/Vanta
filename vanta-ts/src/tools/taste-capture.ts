import { pathToFileURL } from "node:url";
import type { ToolContext } from "./types.js";
import type { CaptureSource } from "./taste-visual.js";
import { resolveInScope } from "../scope.js";
import { extractDomain, isAllowedDomain } from "../browser/allowlist.js";
import { acquirePage } from "../browser/launch.js";

// Live screenshot source for visual-regression snapshots. Kept apart from the
// pure actions so tests inject bytes and never import playwright. Resolves a
// target (http(s) URL or in-scope file path) to a full-page PNG via the shared
// acquirePage. Returns null when chromium is absent → the actions degrade to a
// clear errors-as-value message instead of throwing.

const NAV_TIMEOUT_MS = 30_000;

function targetUrl(target: string, ctx: ToolContext): { ok: true; url: string } | { ok: false; output: string } {
  if (/^https?:\/\//i.test(target)) return { ok: true, url: target };
  const scoped = resolveInScope(target, ctx.root);
  if (!scoped.ok) return { ok: false, output: `path is outside scope: ${target}` };
  return { ok: true, url: pathToFileURL(scoped.path).href };
}

/**
 * Build a CaptureSource, or null if chromium isn't installed. Unlisted http(s)
 * domains are approval-gated (file:// targets are local, no prompt). The
 * returned fn throws on capture failure; callers translate that to a value.
 */
export async function resolveCaptureSource(ctx: ToolContext): Promise<CaptureSource | null> {
  const { chromium } = await import("playwright-core").catch(() => ({ chromium: null }));
  if (!chromium) return null;
  const probe = await acquirePage(chromium, process.env, { headless: true }).catch(() => null);
  if (!probe) return null;
  await probe.close();

  return async (target: string): Promise<Buffer> => {
    const resolved = targetUrl(target, ctx);
    if (!resolved.ok) throw new Error(resolved.output);
    if (/^https?:\/\//i.test(resolved.url) && !isAllowedDomain(resolved.url, process.env)) {
      const domain = extractDomain(resolved.url) ?? resolved.url;
      const approved = await ctx.requestApproval(`visit ${domain}`, "domain not on allowlist");
      if (!approved) throw new Error("denied");
    }
    const acquired = await acquirePage(chromium, process.env, { headless: true });
    const page = acquired.page as unknown as {
      goto: (u: string, o: { timeout: number; waitUntil: "load" }) => Promise<unknown>;
      screenshot: (o: { fullPage: boolean }) => Promise<Buffer>;
    };
    try {
      await page.goto(resolved.url, { timeout: NAV_TIMEOUT_MS, waitUntil: "load" });
      return await page.screenshot({ fullPage: true });
    } finally {
      await acquired.close();
    }
  };
}
