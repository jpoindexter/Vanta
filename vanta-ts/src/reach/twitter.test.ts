import { describe, it, expect } from "vitest";
import { extractAuth, mapTweet, parseTwitterJson, searchTwitter } from "./twitter.js";

describe("extractAuth", () => {
  it("pulls auth_token + ct0 from a cookie header", () => {
    expect(extractAuth("foo=1; auth_token=abc123; ct0=def456; bar=2")).toEqual({ authToken: "abc123", ct0: "def456" });
  });

  it("returns null when either token is missing", () => {
    expect(extractAuth("auth_token=abc")).toBeNull();
    expect(extractAuth("ct0=def")).toBeNull();
    expect(extractAuth("")).toBeNull();
  });
});

describe("mapTweet", () => {
  it("maps fields tolerantly + constructs an x.com url from handle+id", () => {
    expect(mapTweet({ id: "9", handle: "jane", text: "manual work sucks", likes: 12 })).toEqual({
      text: "manual work sucks",
      handle: "jane",
      url: "https://x.com/jane/status/9",
      likes: 12,
    });
  });

  it("falls back across alternate field names", () => {
    const t = mapTweet({ id_str: "5", user: { screen_name: "bob" }, full_text: "hi", favorite_count: 3, url: "https://x.com/bob/status/5" });
    expect(t).toMatchObject({ text: "hi", handle: "bob", likes: 3, url: "https://x.com/bob/status/5" });
  });

  it("never throws on junk", () => {
    expect(mapTweet(null)).toMatchObject({ text: "", handle: "", likes: 0 });
  });
});

describe("parseTwitterJson", () => {
  it("reads the {ok,data:[…]} envelope into posts", () => {
    const out = JSON.stringify({ ok: true, schema_version: "1", data: [{ id: "1", handle: "a", text: "broken tool", likes: 4 }, { id: "2", handle: "b", text: "" }] });
    const r = parseTwitterJson(out);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.posts).toHaveLength(1); // empty-text tweet dropped
      expect(r.posts[0]?.text).toBe("broken tool");
    }
  });

  it("surfaces an error envelope", () => {
    const r = parseTwitterJson(JSON.stringify({ ok: false, error: { code: "not_authenticated", message: "log in first" } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("log in first");
  });

  it("handles a bare array + unparseable output", () => {
    expect(parseTwitterJson(JSON.stringify([{ id: "1", handle: "x", text: "hi" }])).ok).toBe(true);
    expect(parseTwitterJson("not json").ok).toBe(false);
  });
});

describe("searchTwitter graceful degradation", () => {
  it("reports twitter-cli not installed when the binary is absent (no PATH)", async () => {
    const r = await searchTwitter({ query: "x" }, null, { PATH: "/nonexistent" } as NodeJS.ProcessEnv);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("twitter-cli not installed");
  });
});
