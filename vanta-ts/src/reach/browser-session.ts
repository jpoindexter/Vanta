// A general "authenticated browser" primitive: open ANY url in a real headless
// browser with your session cookies injected, and return the rendered text + the
// API requests the page made. Works for any site — login-walled or JS-rendered —
// not just X. The X query-id capture (twitter-capture.ts) is one user of it.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const NAV_TIMEOUT_MS = 30_000;
const DEFAULT_SETTLE_MS = 3500;
const HEADER_DRAIN_MS = 1000;

type PwCookie = { name: string; value: string; url: string };

/** Registrable domain of a URL (drops a leading www.). Pure. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// RFC 6265 cookie-name token chars; anything else (a stray byte) is skipped so one
// bad cookie can't fail playwright's whole addCookies batch.
const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** A value with control chars came from a bad decrypt — drop those cookies. */
function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

/**
 * A cookie header → playwright cookies scoped via the page `url` (so __Host-/
 * __Secure- prefixes resolve correctly, unlike a raw domain). Pure.
 */
export function cookieToPlaywright(header: string, url: string): PwCookie[] {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return [];
  }
  const out: PwCookie[] = [];
  for (const part of header.split(";")) {
    const p = part.trim();
    const i = p.indexOf("=");
    if (i <= 0) continue;
    const name = p.slice(0, i);
    const value = p.slice(i + 1);
    if (COOKIE_NAME.test(name) && !hasControlChars(value)) out.push({ name, value, url: origin });
  }
  return out;
}

export type SessionResult =
  | {
      ok: true;
      text: string;
      requests: string[];
      requestDetails?: SafeRequestDetail[];
      responses?: CapturedJsonResponse[];
    }
  | { ok: false; error: string };

export type SafeRequestDetail = { url: string; headers: Record<string, string> };
export type CapturedJsonResponse = { url: string; status: number; json: unknown };
type SessionOptions = { settleMs?: number; captureJson?: (url: string) => boolean };

const REPLAY_HEADERS = new Set(["x-client-transaction-id", "referer"]);

/** Keep only non-secret headers explicitly approved for request-template replay. */
export function safeReplayHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => REPLAY_HEADERS.has(name.toLowerCase())));
}

/**
 * Open `url` in a headless browser, injecting `cookie` (if given) for the url's
 * origin, and return the body text + every request URL the page issued. Needs
 * playwright-core + chromium; errors-as-values otherwise.
 */
export async function openWithSession(
  url: string,
  cookie: string | null,
  opts: SessionOptions = {},
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
    if (cookie) await context.addCookies(cookieToPlaywright(cookie, url));
    const page = await context.newPage();
    const requests: string[] = [];
    const requestDetails: SafeRequestDetail[] = [];
    const responses: CapturedJsonResponse[] = [];
    const captureReads: Array<Promise<void>> = [];
    page.on("request", (req) => {
      const requestUrl = req.url();
      requests.push(requestUrl);
      if (!requestUrl.includes("/i/api/graphql/")) return;
      captureReads.push(req.allHeaders()
        .then((headers) => { requestDetails.push({ url: requestUrl, headers: safeReplayHeaders(headers) }); })
        .catch(() => {}));
    });
    page.on("response", (res) => {
      const responseUrl = res.url();
      if (!opts.captureJson?.(responseUrl)) return;
      captureReads.push(res.json()
        .then((json) => { responses.push({ url: responseUrl, status: res.status(), json }); })
        .catch(() => {}));
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }).catch(() => {});
    await page.waitForTimeout(opts.settleMs ?? DEFAULT_SETTLE_MS);
    await Promise.race([
      Promise.allSettled([...captureReads]),
      page.waitForTimeout(HEADER_DRAIN_MS),
    ]);
    const text = await page.innerText("body").catch(() => "");
    return { ok: true, text, requests, requestDetails, responses };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
