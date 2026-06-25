import { browserProfileDir, usesPersistentProfile } from "./profile.js";

type Chromium = typeof import("playwright-core").chromium;

/**
 * Minimal structural Page shape the browser tools share. Declared inline (the
 * Node-side tsconfig has no DOM lib and playwright-core is a lazy dep, so its
 * Page type isn't imported at the top level). Tools cast to richer shapes as
 * needed; this is the lowest common denominator acquirePage guarantees.
 */
export type AcquiredPage = {
  goto: (
    url: string,
    opts?: { timeout?: number; waitUntil?: "load" | "domcontentloaded" },
  ) => Promise<unknown>;
};

/** A live page plus a teardown that flushes the persistent profile to disk. */
export type Acquired = { page: AcquiredPage; close: () => Promise<void> };

/**
 * Acquire a browser page, branching on whether Vanta should reuse its persistent
 * authenticated profile (see usesPersistentProfile). The persistent branch
 * launches a single context at the profile dir whose cookies/logins survive
 * across runs; `close()` MUST run for those to flush. The ephemeral branch is
 * the historical default (fresh browser, no saved state) — byte-identical
 * behavior when the profile is absent and the flag is unset.
 *
 * Caller owns graceful degradation: this rethrows playwright's missing-binary
 * error so each tool keeps its own MISSING_BROWSER translation.
 */
export async function acquirePage(
  chromium: Chromium,
  env: NodeJS.ProcessEnv,
  opts: { headless?: boolean; userAgent?: string } = {},
): Promise<Acquired> {
  const headless = opts.headless ?? true;
  // A real UA dodges bot-detection (Brave/search/anti-automation). Only included
  // when provided, so callers that pass none get byte-identical launch options.
  const ua = opts.userAgent;

  if (usesPersistentProfile(env)) {
    const context = await chromium.launchPersistentContext(
      browserProfileDir(env),
      ua ? { headless, userAgent: ua } : { headless },
    );
    // A persistent context opens with one page already; reuse it.
    const pages = context.pages();
    const page = (pages[0] ?? (await context.newPage())) as AcquiredPage;
    return { page, close: () => context.close() };
  }

  const browser = await chromium.launch({ headless });
  const page = (await browser.newPage(ua ? { userAgent: ua } : undefined)) as AcquiredPage;
  return { page, close: () => browser.close() };
}
