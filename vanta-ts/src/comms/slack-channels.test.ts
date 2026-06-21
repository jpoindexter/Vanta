import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_CACHE_TTL_MS,
  clearChannelCache,
  fetchSlackChannels,
  getCachedChannels,
  realSlackFetch,
  slackToken,
  type SlackFetchJson,
} from "./slack-channels.js";

// A fixture conversations.list body — the exact shape Slack returns. Used to verify
// fetch+parse against a MOCK (a real token is the operator's runtime requirement).
const OK_BODY = {
  ok: true,
  channels: [
    { id: "C1", name: "general", is_member: true, is_archived: false },
    { id: "C2", name: "engineering", is_member: true, is_archived: false },
    { id: "C3", name: "old-stuff", is_member: false, is_archived: true },
  ],
};

beforeEach(() => clearChannelCache());
afterEach(() => clearChannelCache());

describe("slackToken", () => {
  it("reads VANTA_SLACK_TOKEN first", () => {
    expect(slackToken({ VANTA_SLACK_TOKEN: "xoxb-canonical" })).toBe("xoxb-canonical");
  });

  it("falls back to SLACK_BOT_TOKEN", () => {
    expect(slackToken({ SLACK_BOT_TOKEN: "xoxb-conventional" })).toBe("xoxb-conventional");
  });

  it("falls back to the messaging-registry VANTA_SLACK_BOT_TOKEN", () => {
    expect(slackToken({ VANTA_SLACK_BOT_TOKEN: "xoxb-registry" })).toBe("xoxb-registry");
  });

  it("trims surrounding whitespace", () => {
    expect(slackToken({ VANTA_SLACK_TOKEN: "  xoxb-spaced  " })).toBe("xoxb-spaced");
  });

  it("returns null when absent or empty (so the fetch is skipped)", () => {
    expect(slackToken({})).toBeNull();
    expect(slackToken({ VANTA_SLACK_TOKEN: "   " })).toBeNull();
  });
});

describe("fetchSlackChannels", () => {
  it("fetches conversations.list and parses the body through parseChannelList", async () => {
    const fetchJson: SlackFetchJson = vi.fn(async () => OK_BODY);
    const out = await fetchSlackChannels({ fetchJson, token: "xoxb-test" });
    expect(out).toEqual([
      { id: "C1", name: "general", isMember: true, isArchived: false },
      { id: "C2", name: "engineering", isMember: true, isArchived: false },
      { id: "C3", name: "old-stuff", isMember: false, isArchived: true },
    ]);
  });

  it("sends the bearer token in the Authorization header to the right endpoint", async () => {
    const fetchJson = vi.fn<SlackFetchJson>(async () => OK_BODY);
    await fetchSlackChannels({ fetchJson, token: "xoxb-secret" });
    const [url, headers] = fetchJson.mock.calls[0]!;
    expect(url).toContain("https://slack.com/api/conversations.list");
    expect(url).toContain("types=public_channel,private_channel");
    expect(url).toContain("limit=1000");
    expect(headers).toEqual({ Authorization: "Bearer xoxb-secret" });
  });

  it("returns [] and logs the reason on a Slack {ok:false,error} response", async () => {
    const fetchJson: SlackFetchJson = async () => ({ ok: false, error: "invalid_auth" });
    const log = vi.fn();
    const out = await fetchSlackChannels({ fetchJson, token: "xoxb-bad" }, log);
    expect(out).toEqual([]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("invalid_auth"));
  });

  it("returns [] and logs the reason when fetchJson throws (network failure)", async () => {
    const fetchJson: SlackFetchJson = async () => {
      throw new Error("ECONNRESET");
    };
    const log = vi.fn();
    const out = await fetchSlackChannels({ fetchJson, token: "xoxb-x" }, log);
    expect(out).toEqual([]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("ECONNRESET"));
  });

  it("never throws — a malformed body yields [] via the pure parser", async () => {
    const fetchJson: SlackFetchJson = async () => "not an object";
    await expect(fetchSlackChannels({ fetchJson, token: "xoxb-x" })).resolves.toEqual([]);
  });
});

describe("getCachedChannels", () => {
  it("fetches once and reuses the snapshot within the TTL", async () => {
    const fetchJson = vi.fn<SlackFetchJson>(async () => OK_BODY);
    const deps = { fetchJson, token: "xoxb-test" };
    let t = 1_000;
    const now = (): number => t;

    const first = await getCachedChannels(deps, DEFAULT_CACHE_TTL_MS, now);
    t += DEFAULT_CACHE_TTL_MS - 1; // still inside the window
    const second = await getCachedChannels(deps, DEFAULT_CACHE_TTL_MS, now);

    expect(first).toBe(second); // same array reference — served from cache
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it("refetches once the TTL has elapsed", async () => {
    const fetchJson = vi.fn<SlackFetchJson>(async () => OK_BODY);
    const deps = { fetchJson, token: "xoxb-test" };
    let t = 1_000;
    const now = (): number => t;

    await getCachedChannels(deps, DEFAULT_CACHE_TTL_MS, now);
    t += DEFAULT_CACHE_TTL_MS + 1; // past the window
    await getCachedChannels(deps, DEFAULT_CACHE_TTL_MS, now);

    expect(fetchJson).toHaveBeenCalledTimes(2);
  });

  it("clearChannelCache forces the next call to refetch", async () => {
    const fetchJson = vi.fn<SlackFetchJson>(async () => OK_BODY);
    const deps = { fetchJson, token: "xoxb-test" };
    const now = (): number => 0;

    await getCachedChannels(deps, DEFAULT_CACHE_TTL_MS, now);
    clearChannelCache();
    await getCachedChannels(deps, DEFAULT_CACHE_TTL_MS, now);

    expect(fetchJson).toHaveBeenCalledTimes(2);
  });
});

describe("realSlackFetch", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("GETs the URL with the headers and returns the parsed JSON body", async () => {
    const spy = vi.fn(async () => ({ json: async () => OK_BODY }) as unknown as Response);
    globalThis.fetch = spy as unknown as typeof fetch;

    const body = await realSlackFetch("https://slack.com/api/x", {
      Authorization: "Bearer xoxb-real",
    });

    expect(spy).toHaveBeenCalledWith("https://slack.com/api/x", {
      method: "GET",
      headers: { Authorization: "Bearer xoxb-real" },
    });
    expect(body).toEqual(OK_BODY);
  });
});
