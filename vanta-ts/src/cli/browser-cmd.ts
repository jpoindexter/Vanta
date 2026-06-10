import { createInterface } from "node:readline/promises";
import { isAllowedDomain } from "../browser/allowlist.js";
import { browserProfileDir } from "../browser/profile.js";

// AUTH-BROWSER — `vanta browser auth <site>`. Opens a HEADED persistent browser
// at Vanta's own profile dir so the user logs into a site once; the session
// persists for later headless tool use. Handler in a NEW file (cli/ops.ts is at
// the 300-line limit). The site→URL resolver is pure + unit-tested.

/**
 * Resolve a CLI `<site>` arg to an absolute URL. Prepends https:// when no
 * scheme is given, so `vanta browser auth github.com` and `…https://github.com`
 * both work. Returns null when the result still isn't a valid URL.
 */
export function siteToUrl(site: string): string | null {
  const trimmed = site.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    return null;
  }
}

/** Wait for the user to press Enter (best-effort; resolves immediately without a TTY). */
async function waitForEnter(prompt: string): Promise<void> {
  if (!process.stdin.isTTY) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await rl.question(prompt);
  } finally {
    rl.close();
  }
}

/**
 * Launch a headed persistent Chromium at the profile dir, navigate to `url`,
 * and wait for the user to log in. Closing the context flushes cookies → later
 * headless tools reuse the session. Best-effort; returns a CLI exit code.
 */
async function runAuthFlow(url: string): Promise<number> {
  let chromium: typeof import("playwright-core").chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    console.error(
      "playwright-core is not installed — run `npm i playwright-core` and `npx playwright install chromium`",
    );
    return 1;
  }

  const profileDir = browserProfileDir(process.env);
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | null = null;
  try {
    context = await chromium.launchPersistentContext(profileDir, { headless: false });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(url, { timeout: 60_000 }).catch(() => {});
    console.log(`\nOpened ${url} in Vanta's browser profile (${profileDir}).`);
    console.log("Log in, then press Enter here (or close the window) to save the session.");
    await waitForEnter("> ");
    return 0;
  } catch (err) {
    const msg = (err as Error).message;
    if (/Executable doesn't exist|playwright install|browserType\./i.test(msg)) {
      console.error("No browser binary found. Run `npx playwright install chromium`.");
      return 1;
    }
    console.error(`browser auth failed: ${msg}`);
    return 1;
  } finally {
    // Closing flushes cookies/storage to the profile dir.
    await context?.close().catch(() => {});
  }
}

/** Print the off-allowlist refusal for `url` and return exit code 1. */
async function refuseOffAllowlist(url: string): Promise<number> {
  const { extractDomain } = await import("../browser/allowlist.js");
  const domain = extractDomain(url) ?? url;
  console.error(
    `refused: ${domain} is not in VANTA_ALLOWED_DOMAINS.\n` +
      `Add it (e.g. VANTA_ALLOWED_DOMAINS=${domain}) then re-run — ` +
      `headless tools can only reuse the profile for allowlisted domains.`,
  );
  return 1;
}

/** Print the `vanta browser` usage and return the appropriate exit code. */
function printUsage(unknownSub?: string): number {
  console.log("usage: vanta browser auth <site>");
  console.log("  opens <site> in Vanta's own browser profile so you log in once;");
  console.log("  the session then persists for headless browser tools.");
  return unknownSub ? 1 : 0;
}

/**
 * `vanta browser [auth <site>]`. Resolves the site to an allowlisted URL, then
 * delegates to the headed auth flow.
 */
export async function runBrowserCommand(rest: string[]): Promise<number> {
  if (rest[0] !== "auth") return printUsage(rest[0]);

  const site = rest.slice(1).join(" ").trim();
  const url = site ? siteToUrl(site) : null;
  if (!url) {
    console.error("usage: vanta browser auth <site>   (e.g. github.com)");
    return 1;
  }
  if (!isAllowedDomain(url, process.env)) return refuseOffAllowlist(url);

  return runAuthFlow(url);
}
