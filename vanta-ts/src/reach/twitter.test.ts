import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { searchTwitter, bookmarks, loadQids, saveQids } from "./twitter.js";
import { assertPublicUrl } from "../net/ssrf-guard.js";

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
});

describe("native client mocked fetch paths", () => {
  it("an env query-id override skips the heal short-circuit and reaches the fetch (mocked)", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const env = { ...process.env, VANTA_TWITTER_QID_BOOKMARKS: "ZZZ", VANTA_ALLOW_PRIVATE_FETCH: "1" } as NodeJS.ProcessEnv;
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
      const env = { ...process.env, VANTA_TWITTER_QID_BOOKMARKS: "ZZZ", VANTA_ALLOW_PRIVATE_FETCH: "1" } as NodeJS.ProcessEnv;
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

describe("auto-heal on a stale-qid 404", () => {
  // parseTimeline walks the whole tree, so a flat node with legacy.full_text is enough.
  const oneTweet = {
    result: {
      rest_id: "123",
      core: { user_results: { result: { core: { screen_name: "jane" } } } },
      legacy: { full_text: "invoices by hand is painful", favorite_count: 7 },
    },
  };

  it("heals, reloads the refreshed id, and retries once → success", async () => {
    saveQids({ SearchTimeline: "STALE" }, process.env);
    const fetchSpy = vi.fn(async (url: string) =>
      String(url).includes("/STALE/")
        ? { ok: false, status: 404, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => oneTweet },
    );
    vi.stubGlobal("fetch", fetchSpy);
    const heal = vi.fn(async () => { saveQids({ SearchTimeline: "FRESH" }, process.env); });
    try {
      const env = { ...process.env, VANTA_ALLOW_PRIVATE_FETCH: "1" } as NodeJS.ProcessEnv;
      const r = await searchTwitter({ query: "invoices" }, "auth_token=a; ct0=b", env, heal);
      expect(heal).toHaveBeenCalledOnce();
      expect(fetchSpy).toHaveBeenCalledTimes(2); // 404 on STALE, retried on FRESH
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.posts[0]).toMatchObject({ handle: "jane" });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("when heal can't refresh the id, returns web_search fallback guidance (no retry)", async () => {
    saveQids({ SearchTimeline: "STALE" }, process.env);
    const fetchSpy = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchSpy);
    const heal = vi.fn(async () => {}); // runs, but the id stays stale
    try {
      const env = { ...process.env, VANTA_ALLOW_PRIVATE_FETCH: "1" } as NodeJS.ProcessEnv;
      const r = await searchTwitter({ query: "x" }, "auth_token=a; ct0=b", env, heal);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/site:x\.com/);
      expect(heal).toHaveBeenCalledOnce();
      expect(fetchSpy).toHaveBeenCalledOnce(); // no retry — id unchanged
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("SSRF guard (xGraphQL choke point)", () => {
  // The xGraphQL fetch is preceded by assertPublicUrl on this exact URL shape.
  // The guard returns a clean errors-as-value failure (never throws), which the
  // choke point forwards verbatim instead of fetching. Guard logic is exercised
  // here against the X URL with an injected resolver; the live client uses real DNS.
  const url = "https://x.com/i/api/graphql/ZZZ/Bookmarks";

  it("refuses an X host that resolves to a metadata/private address", async () => {
    const env = { ...process.env } as NodeJS.ProcessEnv;
    delete env.VANTA_ALLOW_PRIVATE_FETCH;
    const blocked = await assertPublicUrl(url, { env, resolver: async () => ["169.254.169.254"] });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toContain("private address");
  });

  it("allows the same X host when it resolves to a public address", async () => {
    const env = { ...process.env } as NodeJS.ProcessEnv;
    delete env.VANTA_ALLOW_PRIVATE_FETCH;
    const allowed = await assertPublicUrl(url, { env, resolver: async () => ["104.244.42.1"] });
    expect(allowed.ok).toBe(true);
  });
});
