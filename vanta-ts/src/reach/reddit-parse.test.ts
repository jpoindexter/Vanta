import { describe, it, expect } from "vitest";
import { parseListing, parseThread, formatPosts, formatThread } from "./reddit-parse.js";

const LISTING = {
  data: {
    children: [
      { kind: "t3", data: { title: "Rust is great", author: "a", subreddit: "rust", score: 120, num_comments: 30, permalink: "/r/rust/1", selftext: "body" } },
      { kind: "t3", data: { title: "Another", author: "b", subreddit: "rust", score: 5, num_comments: 2, permalink: "/r/rust/2" } },
      { kind: "t1", data: { body: "not a post" } }, // wrong kind — ignored
    ],
  },
};

const THREAD = [
  { data: { children: [{ kind: "t3", data: { title: "The post", author: "op", subreddit: "rust", score: 50, permalink: "/r/rust/1", selftext: "post body" } }] } },
  { data: { children: [
    { kind: "t1", data: { author: "c1", score: 9, body: "great point" } },
    { kind: "t1", data: { author: "c2", score: 3, body: "agree" } },
    { kind: "more", data: {} }, // not a comment — ignored
  ] } },
];

describe("parseListing", () => {
  it("keeps t3 posts only, maps fields", () => {
    const posts = parseListing(LISTING);
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({ title: "Rust is great", subreddit: "rust", score: 120, comments: 30, permalink: "/r/rust/1" });
  });

  it("returns [] for a bad shape, never throws", () => {
    expect(parseListing(null)).toEqual([]);
    expect(parseListing({ data: {} })).toEqual([]);
  });
});

describe("parseThread", () => {
  it("extracts the post + top-level t1 comments", () => {
    const t = parseThread(THREAD);
    expect(t.post?.title).toBe("The post");
    expect(t.comments).toHaveLength(2);
    expect(t.comments[0]).toMatchObject({ author: "c1", score: 9, body: "great point" });
  });

  it("returns null post for a bad shape", () => {
    expect(parseThread({}).post).toBeNull();
    expect(parseThread([]).comments).toEqual([]);
  });
});

describe("formatPosts + formatThread (cited)", () => {
  it("formats posts with permalink citations", () => {
    const out = formatPosts(parseListing(LISTING));
    expect(out).toContain("1. Rust is great");
    expect(out).toContain("https://www.reddit.com/r/rust/1");
    expect(out).toContain("r/rust");
  });

  it("formats a thread with the post + top comments", () => {
    const out = formatThread(parseThread(THREAD));
    expect(out).toContain("The post");
    expect(out).toContain("u/c1");
    expect(out).toContain("great point");
  });

  it("handles empty gracefully", () => {
    expect(formatPosts([])).toContain("No posts");
    expect(formatThread({ post: null, comments: [] })).toContain("not found");
  });
});
