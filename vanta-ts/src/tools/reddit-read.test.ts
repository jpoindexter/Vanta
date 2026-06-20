import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { redditReadTool, redditSearchPageUrl } from "./reddit-read.js";
import { saveCookie } from "../reach/cookie.js";
import { openWithSession } from "../reach/browser-session.js";
import type { ToolContext } from "./types.js";

// Mock the browser fallback so tests never launch a real browser.
vi.mock("../reach/browser-session.js", () => ({ openWithSession: vi.fn() }));
const mockedOpen = vi.mocked(openWithSession);

const ctx = {} as ToolContext;

let home: string;
let prev: string | undefined;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "vanta-reddit-"));
  prev = process.env.VANTA_HOME;
  process.env.VANTA_HOME = home;
  // Stubbed fetch of reddit.com: opt out of the SSRF guard so the stub answers
  // and the unit test does no real DNS. Guard coverage is in src/net/.
  process.env.VANTA_ALLOW_PRIVATE_FETCH = "1";
  mockedOpen.mockReset();
});
afterEach(() => {
  if (prev === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = prev;
  delete process.env.VANTA_ALLOW_PRIVATE_FETCH;
  rmSync(home, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("redditSearchPageUrl", () => {
  it("builds the search page url, restricting to a subreddit when given", () => {
    expect(redditSearchPageUrl("rust")).toContain("reddit.com/search/?q=rust");
    expect(redditSearchPageUrl("x", "rust")).toContain("/r/rust/search/?q=x&restrict_sr=1");
  });
});

describe("reddit_read primary (.json) path", () => {
  beforeEach(() => saveCookie("reddit", "session=abc"));

  it("validates the action", async () => {
    expect((await redditReadTool.execute({ action: "x" }, ctx)).ok).toBe(false);
  });

  it("search fetches reddit's .json with the cookie + parses posts (no fallback)", async () => {
    const json = { data: { children: [{ kind: "t3", data: { title: "Hit", subreddit: "rust", score: 7, num_comments: 1, permalink: "/r/rust/1" } }] } };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => json })));
    const r = await redditReadTool.execute({ action: "search", query: "rust" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("Hit");
    expect(mockedOpen).not.toHaveBeenCalled();
  });
});

describe("reddit_read browser fallback", () => {
  it("falls back to the browser when .json is blocked (403)", async () => {
    saveCookie("reddit", "session=abc");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })));
    mockedOpen.mockResolvedValue({ ok: true, text: "rendered reddit thread text", requests: [] });
    const r = await redditReadTool.execute({ action: "read", url: "https://www.reddit.com/r/rust/1" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("via browser session");
    expect(r.output).toContain("rendered reddit thread text");
    expect(mockedOpen).toHaveBeenCalledOnce();
  });

  it("with no cookie, anonymous .json fails → browser reads the public page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })));
    mockedOpen.mockResolvedValue({ ok: true, text: "public search results", requests: [] });
    const r = await redditReadTool.execute({ action: "search", query: "rust" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("public search results");
  });

  it("surfaces a combined error + cookie hint when both .json and browser fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })));
    mockedOpen.mockResolvedValue({ ok: false, error: "playwright-core not installed" });
    const r = await redditReadTool.execute({ action: "read", url: "https://www.reddit.com/r/rust/1" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("403");
    expect(r.output).toContain("browser fallback");
    expect(r.output).toContain("cookie_import");
  });
});

describe("reddit_read describeForSafety", () => {
  it("surfaces the action", () => {
    expect(redditReadTool.describeForSafety?.({ action: "search" })).toBe("reddit search");
  });
});
