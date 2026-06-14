import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { searchTwitter, bookmarks, loadQids, saveQids } from "./twitter.js";

let home: string;
let prev: string | undefined;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "vanta-tw-"));
  prev = process.env.VANTA_HOME;
  process.env.VANTA_HOME = home;
});
afterEach(() => {
  if (prev === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = prev;
  rmSync(home, { recursive: true, force: true });
});

describe("query id cache", () => {
  it("round-trips qids + tolerates a missing file", () => {
    expect(loadQids(process.env)).toEqual({});
    saveQids({ Bookmarks: "X1", SearchTimeline: "Y2" }, process.env);
    expect(loadQids(process.env)).toEqual({ Bookmarks: "X1", SearchTimeline: "Y2" });
  });
});

describe("native client graceful paths (no network)", () => {
  it("search/bookmarks need a cookie", async () => {
    expect((await searchTwitter({ query: "x" }, null)).ok).toBe(false);
    expect((await bookmarks({}, null)).ok).toBe(false);
  });

  it("a malformed cookie (no auth_token/ct0) is rejected before any fetch", async () => {
    const r = await searchTwitter({ query: "x" }, "junk=1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("auth_token/ct0");
  });

  it("with a valid cookie but no query id, asks to heal (no fetch)", async () => {
    const r = await bookmarks({}, "auth_token=a; ct0=b");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("reach heal twitter");
  });

  it("an env query-id override skips the heal short-circuit and reaches the fetch (mocked)", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const env = { ...process.env, VANTA_TWITTER_QID_BOOKMARKS: "ZZZ" } as NodeJS.ProcessEnv;
      const r = await bookmarks({}, "auth_token=a; ct0=b", env);
      expect(fetchSpy).toHaveBeenCalledOnce(); // got past the qid gate to the request
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain("401");
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("returns parsed posts on a successful GraphQL response (mocked)", async () => {
    const timeline = {
      data: { bookmark_timeline_v2: { timeline: { instructions: [{ entries: [{ content: { itemContent: { tweet_results: {
        result: { rest_id: "9", core: { user_results: { result: { legacy: { screen_name: "me" } } } }, legacy: { full_text: "saved this", favorite_count: 1 } },
      } } } }] }] } } },
    };
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => timeline }));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const env = { ...process.env, VANTA_TWITTER_QID_BOOKMARKS: "ZZZ" } as NodeJS.ProcessEnv;
      const r = await bookmarks({}, "auth_token=a; ct0=b", env);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.posts[0]).toMatchObject({ handle: "me", text: "saved this", url: "https://x.com/me/status/9" });
      // the cookie + csrf were sent
      const [, opts] = fetchSpy.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
      expect(opts.headers["x-csrf-token"]).toBe("b");
    } finally {
      vi.restoreAllMocks();
    }
  });
});
