// Pure parsers for Reddit's JSON API (the .json endpoints). Tolerant: a bad
// shape yields empty, never throws. The reddit_read tool fetches with the
// stored cookie; these turn the response into clean, cited results.

export type RedditPost = {
  title: string;
  author: string;
  subreddit: string;
  score: number;
  comments: number;
  permalink: string;
  body: string;
};

export type RedditComment = { author: string; score: number; body: string };

type Child = { kind?: string; data?: Record<string, unknown> };
function children(listing: unknown): Child[] {
  const c = (listing as { data?: { children?: unknown } })?.data?.children;
  return Array.isArray(c) ? (c as Child[]) : [];
}

function str(d: Record<string, unknown> | undefined, k: string): string {
  const v = d?.[k];
  return typeof v === "string" ? v : "";
}
function num(d: Record<string, unknown> | undefined, k: string): number {
  const v = d?.[k];
  return typeof v === "number" ? v : 0;
}

function toPost(d: Record<string, unknown> | undefined): RedditPost {
  return {
    title: str(d, "title"),
    author: str(d, "author"),
    subreddit: str(d, "subreddit"),
    score: num(d, "score"),
    comments: num(d, "num_comments"),
    permalink: str(d, "permalink"),
    body: str(d, "selftext"),
  };
}

/** Parse a search/listing response into posts. */
export function parseListing(json: unknown): RedditPost[] {
  return children(json)
    .filter((c) => c.kind === "t3")
    .map((c) => toPost(c.data))
    .filter((p) => p.title);
}

/** Parse a permalink `[post, comments]` response into the post + top-level comments. */
export function parseThread(json: unknown): { post: RedditPost | null; comments: RedditComment[] } {
  const arr = Array.isArray(json) ? json : [];
  const post = children(arr[0])[0]?.data;
  const comments = children(arr[1])
    .filter((c) => c.kind === "t1")
    .map((c) => ({ author: str(c.data, "author"), score: num(c.data, "score"), body: str(c.data, "body") }))
    .filter((c) => c.body);
  return { post: post ? toPost(post) : null, comments };
}

const BASE = "https://www.reddit.com";

export function formatPosts(posts: RedditPost[]): string {
  if (posts.length === 0) return "No posts found.";
  return [`${posts.length} post(s):`, ...posts.map((p, i) =>
    `${i + 1}. ${p.title}  (r/${p.subreddit} · ↑${p.score} · ${p.comments} comments)\n   ${BASE}${p.permalink}`,
  )].join("\n");
}

export function formatThread(t: { post: RedditPost | null; comments: RedditComment[] }): string {
  if (!t.post) return "Post not found.";
  const head = `${t.post.title}  (r/${t.post.subreddit} · ↑${t.post.score})\n${BASE}${t.post.permalink}`;
  const body = t.post.body ? `\n\n${t.post.body.slice(0, 600)}` : "";
  const top = t.comments.slice(0, 10).map((c) => `  • u/${c.author} (↑${c.score}): ${c.body.slice(0, 300)}`);
  const comments = top.length ? `\n\nTop comments:\n${top.join("\n")}` : "";
  return head + body + comments;
}
