import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { redditReadTool } from "./reddit-read.js";
import { saveCookie } from "../reach/cookie.js";
import type { ToolContext } from "./types.js";

const ctx = {} as ToolContext;

let home: string;
let prev: string | undefined;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "vanta-reddit-"));
  prev = process.env.VANTA_HOME;
  process.env.VANTA_HOME = home;
});
afterEach(() => {
  if (prev === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = prev;
  rmSync(home, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("reddit_read without a cookie", () => {
  it("returns the exact setup step (anonymous blocked), no fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const r = await redditReadTool.execute({ action: "search", query: "rust" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("cookie_import");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("reddit_read with a cookie", () => {
  beforeEach(() => saveCookie("reddit", "session=abc"));

  it("validates the action", async () => {
    expect((await redditReadTool.execute({ action: "x" }, ctx)).ok).toBe(false);
  });

  it("search fetches reddit's .json with the cookie and parses posts", async () => {
    const json = { data: { children: [{ kind: "t3", data: { title: "Hit", subreddit: "rust", score: 7, num_comments: 1, permalink: "/r/rust/1" } }] } };
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => json }));
    vi.stubGlobal("fetch", fetchSpy);

    const r = await redditReadTool.execute({ action: "search", query: "rust" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("Hit");
    const [url, opts] = fetchSpy.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(String(url)).toContain("search.json?q=rust");
    expect(opts.headers.cookie).toBe("session=abc");
  });

  it("read needs a url + surfaces a 403 as cookie-expired", async () => {
    expect((await redditReadTool.execute({ action: "read" }, ctx)).output).toContain("needs a url");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })));
    const r = await redditReadTool.execute({ action: "read", url: "https://reddit.com/r/rust/1" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("403");
  });
});

describe("reddit_read describeForSafety", () => {
  it("surfaces the action", () => {
    expect(redditReadTool.describeForSafety?.({ action: "search" })).toBe("reddit search");
  });
});
