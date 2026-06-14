import { describe, it, expect, vi, afterEach } from "vitest";
import { rssReadTool } from "./rss-read.js";
import type { ToolContext } from "./types.js";

const ctx = {} as ToolContext; // rss_read takes no ctx-dependent path

const FEED = `<rss version="2.0"><channel><title>T</title>
  <item><title>One</title><link>https://x.test/1</link></item>
  <item><title>Two</title><link>https://x.test/2</link></item>
</channel></rss>`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rss_read validation", () => {
  it("rejects a missing/invalid url", async () => {
    expect((await rssReadTool.execute({}, ctx)).ok).toBe(false);
    expect((await rssReadTool.execute({ url: "not a url" }, ctx)).output).toContain('valid "url"');
  });
});

describe("rss_read fetch", () => {
  it("fetches + parses a feed into numbered items (mocked fetch)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, text: async () => FEED })));
    const r = await rssReadTool.execute({ url: "https://x.test/feed.xml" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("T — 2 item(s)");
    expect(r.output).toContain("1. One");
    expect(r.output).toContain("https://x.test/2");
  });

  it("honors the limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, text: async () => FEED })));
    const r = await rssReadTool.execute({ url: "https://x.test/feed.xml", limit: 1 }, ctx);
    expect(r.output).toContain("1 item(s)");
    expect(r.output).not.toContain("2. Two");
  });

  it("returns an error value on a non-200", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, text: async () => "" })));
    const r = await rssReadTool.execute({ url: "https://x.test/feed.xml" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("HTTP 404");
  });

  it("returns an error value when fetch throws (never throws out)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const r = await rssReadTool.execute({ url: "https://x.test/feed.xml" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("ECONNREFUSED");
  });
});

describe("rss_read describeForSafety", () => {
  it("surfaces the feed url", () => {
    expect(rssReadTool.describeForSafety?.({ url: "https://x.test/f.xml" })).toBe("read rss feed: https://x.test/f.xml");
  });
});
