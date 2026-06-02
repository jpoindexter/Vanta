import { describe, it, expect, vi } from "vitest";
import { jwtExp, accessTokenExpiring, refreshCodexTokens, loadCodexCreds } from "./codex-auth.js";

// Build a fake JWT with a given exp claim (only the payload segment matters).
const jwt = (exp: number) => `h.${Buffer.from(JSON.stringify({ exp })).toString("base64")}.s`;
const NOW = 1_780_000_000; // fixed clock (seconds)

function authJson(token: string) {
  return JSON.stringify({
    auth_mode: "chatgpt",
    tokens: { access_token: token, refresh_token: "rt_old", account_id: "acc-1" },
  });
}

describe("jwtExp / accessTokenExpiring", () => {
  it("decodes the exp claim", () => {
    expect(jwtExp(jwt(123))).toBe(123);
  });
  it("returns null for an unparseable token", () => {
    expect(jwtExp("not-a-jwt")).toBeNull();
  });
  it("is not expiring when exp is well in the future", () => {
    expect(accessTokenExpiring(jwt(NOW + 3600), NOW)).toBe(false);
  });
  it("is expiring within the skew window", () => {
    expect(accessTokenExpiring(jwt(NOW + 60), NOW)).toBe(true);
  });
  it("treats an unreadable token as expiring", () => {
    expect(accessTokenExpiring("garbage", NOW)).toBe(true);
  });
});

describe("refreshCodexTokens", () => {
  it("POSTs the refresh grant and returns the new pair", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: "new-access", refresh_token: "rt_new" }), { status: 200 }),
    ) as unknown as typeof fetch;
    const out = await refreshCodexTokens("rt_old", fetchImpl);
    expect(out).toEqual({ access_token: "new-access", refresh_token: "rt_new" });
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(init.body)).toContain("grant_type=refresh_token");
    expect(String(init.body)).toContain("rt_old");
  });
  it("keeps the old refresh_token if none is returned", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ access_token: "a" }), { status: 200 })) as typeof fetch;
    const out = await refreshCodexTokens("rt_old", fetchImpl);
    expect(out.refresh_token).toBe("rt_old");
  });
  it("throws a retry-later error on 429", async () => {
    const fetchImpl = (async () => new Response("", { status: 429 })) as typeof fetch;
    await expect(refreshCodexTokens("rt_old", fetchImpl)).rejects.toThrow(/rate-limited|retry/i);
  });
  it("throws an actionable error on failure", async () => {
    const fetchImpl = (async () => new Response("bad", { status: 401 })) as typeof fetch;
    await expect(refreshCodexTokens("rt_old", fetchImpl)).rejects.toThrow(/codex login/i);
  });
});

describe("loadCodexCreds", () => {
  it("uses the stored token without refreshing when it is fresh", async () => {
    const write = vi.fn();
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const creds = await loadCodexCreds({
      authPath: "/fake",
      read: () => authJson(jwt(NOW + 3600)),
      write,
      fetchImpl,
      now: () => NOW * 1000,
    });
    expect(creds).toEqual({ accessToken: jwt(NOW + 3600), accountId: "acc-1" });
    expect(write).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refreshes and writes the rotated tokens back when expiring", async () => {
    const write = vi.fn();
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ access_token: "fresh-access", refresh_token: "rt_rotated" }), {
        status: 200,
      })) as typeof fetch;
    const creds = await loadCodexCreds({
      authPath: "/fake",
      read: () => authJson(jwt(NOW + 10)), // expiring
      write,
      fetchImpl,
      now: () => NOW * 1000,
    });
    expect(creds.accessToken).toBe("fresh-access");
    expect(write).toHaveBeenCalledTimes(1);
    const written = JSON.parse(write.mock.calls[0]![1]);
    expect(written.tokens.access_token).toBe("fresh-access");
    expect(written.tokens.refresh_token).toBe("rt_rotated");
  });

  it("throws an actionable error when the file is missing", async () => {
    await expect(
      loadCodexCreds({
        authPath: "/missing",
        read: () => {
          throw new Error("ENOENT");
        },
      }),
    ).rejects.toThrow(/codex login/i);
  });

  it("throws when tokens are absent", async () => {
    await expect(
      loadCodexCreds({ authPath: "/fake", read: () => JSON.stringify({ auth_mode: "chatgpt" }) }),
    ).rejects.toThrow(/missing tokens/i);
  });
});
