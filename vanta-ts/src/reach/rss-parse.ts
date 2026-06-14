// Dependency-free RSS 2.0 / Atom feed parser. Feeds are simple enough that a
// focused block-and-tag extractor beats pulling an XML dependency. Pure +
// tolerant: missing fields degrade to empty, never throw.

export type FeedItem = {
  title: string;
  link: string;
  date: string;
  summary: string;
};

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function clean(s: string): string {
  return decodeEntities(stripCdata(s).replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/** First non-empty match of any of the given tag names within a block. */
function firstTag(block: string, names: string[]): string {
  for (const name of names) {
    const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(block);
    if (m && m[1]?.trim()) return clean(m[1]);
  }
  return "";
}

/** RSS uses <link>text</link>; Atom uses <link href="..."/>. Try both. */
function extractLink(block: string): string {
  const href = /<link[^>]*\shref=["']([^"']+)["']/i.exec(block);
  if (href?.[1]) return href[1];
  const text = /<link[^>]*>([\s\S]*?)<\/link>/i.exec(block);
  return text?.[1] ? clean(text[1]) : "";
}

function blockToItem(block: string): FeedItem {
  return {
    title: firstTag(block, ["title"]),
    link: extractLink(block),
    date: firstTag(block, ["pubDate", "published", "updated", "dc:date"]),
    summary: firstTag(block, ["description", "summary", "content:encoded", "content"]),
  };
}

/** Parse an RSS/Atom document into items (RSS <item> or Atom <entry>). */
export function parseFeed(xml: string): FeedItem[] {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi) ?? [];
  return blocks.map(blockToItem).filter((it) => it.title || it.link);
}

/** The feed's own title (channel/feed level), best-effort. */
export function feedTitle(xml: string): string {
  const head = xml.replace(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi, "");
  return firstTag(head, ["title"]) || "feed";
}
