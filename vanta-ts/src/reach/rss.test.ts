import { describe, it, expect, vi, afterEach } from "vitest";
import { discoverFeed, fetchFeed } from "./rss.js";

afterEach(() => vi.restoreAllMocks());

describe("discoverFeed", () => {
  it("finds an rss/atom <link rel=alternate> and resolves it absolute", () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" href="/feed.xml" title="Feed">
    </head></html>`;
    expect(discoverFeed(html, "https://blog.test/about")).toBe("https://blog.test/feed.xml");
  });

  it("keeps an absolute href + handles atom", () => {
    const html = `<link rel="alternate" type="application/atom+xml" href="https://x.test/atom">`;
    expect(discoverFeed(html, "https://blog.test")).toBe("https://x.test/atom");
  });

  it("returns null when there is no feed link", () => {
    expect(discoverFeed("<html><head><title>no feed</title></head></html>", "https://x")).toBeNull();
  });
});

describe("fetchFeed auto-discovery (#322)", () => {
  it("follows a discovered feed when the page itself has no items", async () => {
    const homepage = `<html><head><link rel="alternate" type="application/rss+xml" href="https://blog.test/feed.xml"></head><body>hi</body></html>`;
    const feed = `<rss><channel><title>Blog</title><item><title>Post</title><link>https://blog.test/1</link></item></channel></rss>`;
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => homepage })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => feed });
    vi.stubGlobal("fetch", fetchSpy);

    const r = await fetchFeed("https://blog.test/");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.title).toBe("Blog");
      expect(r.items).toHaveLength(1);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(2); // homepage → discovered feed
  });

  it("does not recurse past one level (no feed found → empty items)", async () => {
    const noFeed = `<html><head><title>nothing</title></head></html>`;
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => noFeed });
    vi.stubGlobal("fetch", fetchSpy);
    const r = await fetchFeed("https://x.test/");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.items).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
