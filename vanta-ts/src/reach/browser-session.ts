// A general "authenticated browser" primitive: open ANY url in a real headless
// browser with your session cookies injected, and return the rendered text + the
// API requests the page made. Works for any site — login-walled or JS-rendered —
// not just X. The X query-id capture (twitter-capture.ts) is one user of it.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const NAV_TIMEOUT_MS = 30_000;
const DEFAULT_SETTLE_MS = 3500;

type PwCookie = { name: string; value: string; domain: string; path: string; secure: boolean };

/** Registrable domain of a URL (drops a leading www.). Pure. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** A cookie header → playwright cookie objects scoped to a domain. Pure. */
export function cookieToPlaywright(header: string, domain: string): PwCookie[] {
  const dot = domain.startsWith(".") ? domain : `.${domain}`;
  return header
    .split(";")
    .map((p) => p.trim())
    .map((p) => {
      const i = p.indexOf("=");
      return i > 0 ? { name: p.slice(0, i), value: p.slice(i + 1), domain: dot, path: "/", secure: true } : null;
    })
    .filter((c): c is PwCookie => c !== null);
}

export type SessionResult =
  | { ok: true; text: string; requests: string[] }
  | { ok: false; error: string };

/**
 * Open `url` in a headless browser, injecting `cookie` (if given) for the url's
 * domain, and return the body text + every request URL the page issued. Needs
 * playwright-core + chromium; errors-as-values otherwise.
 */
export async function openWithSession(
  url: string,
  cookie: string | null,
  opts: { settleMs?: number } = {},
): Promise<SessionResult> {
  let chromium: typeof import("playwright-core").chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    return { ok: false, error: "playwright-core not installed (npx playwright install chromium)" };
  }
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: UA });
    if (cookie) await context.addCookies(cookieToPlaywright(cookie, domainOf(url)));
    const page = await context.newPage();
    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }).catch(() => {});
    await page.waitForTimeout(opts.settleMs ?? DEFAULT_SETTLE_MS);
    const text = await page.innerText("body").catch(() => "");
    return { ok: true, text, requests };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
