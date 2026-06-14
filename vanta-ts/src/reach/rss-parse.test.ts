import { describe, it, expect } from "vitest";
import { parseFeed, feedTitle } from "./rss-parse.js";

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Indie Blog</title>
  <item>
    <title>Shipping v1</title>
    <link>https://blog.test/v1</link>
    <pubDate>Mon, 01 Jun 2026 10:00:00 GMT</pubDate>
    <description><![CDATA[We <b>shipped</b> it &amp; it works]]></description>
  </item>
  <item>
    <title>Second post</title>
    <link>https://blog.test/2</link>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <title>Atom entry one</title>
    <link href="https://atom.test/1" rel="alternate"/>
    <updated>2026-06-01T10:00:00Z</updated>
    <summary>An atom summary</summary>
  </entry>
</feed>`;

describe("parseFeed — RSS 2.0", () => {
  it("extracts title, link, date, and CDATA/entity-cleaned summary", () => {
    const items = parseFeed(RSS);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "Shipping v1",
      link: "https://blog.test/v1",
      date: "Mon, 01 Jun 2026 10:00:00 GMT",
    });
    expect(items[0]?.summary).toBe("We shipped it & it works"); // tags stripped, &amp; decoded
  });

  it("tolerates an item missing date + summary", () => {
    const items = parseFeed(RSS);
    expect(items[1]).toMatchObject({ title: "Second post", link: "https://blog.test/2", date: "", summary: "" });
  });
});

describe("parseFeed — Atom", () => {
  it("reads the href link attribute and updated date", () => {
    const items = parseFeed(ATOM);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: "Atom entry one",
      link: "https://atom.test/1",
      date: "2026-06-01T10:00:00Z",
      summary: "An atom summary",
    });
  });
});

describe("feedTitle", () => {
  it("returns the feed/channel title, not an item title", () => {
    expect(feedTitle(RSS)).toBe("Indie Blog");
    expect(feedTitle(ATOM)).toBe("Atom Feed");
  });

  it("falls back to 'feed' when there is no title", () => {
    expect(feedTitle("<rss><channel></channel></rss>")).toBe("feed");
  });
});

describe("parseFeed — robustness", () => {
  it("returns [] for non-feed input, never throws", () => {
    expect(parseFeed("<html><body>not a feed</body></html>")).toEqual([]);
    expect(parseFeed("")).toEqual([]);
  });
});
