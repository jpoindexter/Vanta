import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMcpAuthUrl, tokenFromResponse, exchangeCodeForToken, startMcpAuth, type McpAuthConfig, type FetchLike } from "./auth-flow.js";
import { loadMcpToken } from "./auth-store.js";

const cfg: McpAuthConfig = {
  authorizationUrl: "https://auth.example.com/authorize",
  tokenUrl: "https://auth.example.com/token",
  clientId: "client-123",
  clientSecret: "shh",
  scope: "read write",
};

describe("buildMcpAuthUrl (pure)", () => {
  it("builds an authorization-code consent URL with all params", () => {
    const url = new URL(buildMcpAuthUrl(cfg, "http://127.0.0.1:5555", "github"));
    expect(url.origin + url.pathname).toBe("https://auth.example.com/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:5555");
    expect(url.searchParams.get("state")).toBe("github");
    expect(url.searchParams.get("scope")).toBe("read write");
  });

  it("omits scope when not configured", () => {
    const url = new URL(buildMcpAuthUrl({ ...cfg, scope: undefined }, "http://127.0.0.1:1", "s"));
    expect(url.searchParams.has("scope")).toBe(false);
  });
});

describe("tokenFromResponse (pure)", () => {
  it("maps a token endpoint response, deriving expiry from expires_in", () => {
    const before = Date.now();
    const token = tokenFromResponse({ access_token: "a", refresh_token: "r", token_type: "Bearer", expires_in: 3600 });
    expect(token?.access_token).toBe("a");
    expect(token?.refresh_token).toBe("r");
    expect(token?.expiry_date).toBeGreaterThanOrEqual(before + 3600 * 1000);
  });

  it("returns null when access_token is missing", () => {
    expect(tokenFromResponse({ token_type: "Bearer" })).toBeNull();
    expect(tokenFromResponse("nope")).toBeNull();
  });
});

function fakeFetch(impl: Partial<{ ok: boolean; status: number; json: unknown }>): FetchLike {
  return async () => ({
    ok: impl.ok ?? true,
    status: impl.status ?? 200,
    json: async () => impl.json ?? {},
    text: async () => JSON.stringify(impl.json ?? {}),
  });
}

describe("exchangeCodeForToken (mocked fetch)", () => {
  it("returns the token on a successful exchange", async () => {
    const res = await exchangeCodeForToken(cfg, "the-code", "http://127.0.0.1:9", fakeFetch({ json: { access_token: "tok" } }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.token.access_token).toBe("tok");
  });

  it("returns an error (not a throw) on a non-2xx token endpoint", async () => {
    const res = await exchangeCodeForToken(cfg, "c", "http://127.0.0.1:9", fakeFetch({ ok: false, status: 400 }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("HTTP 400");
  });

  it("returns an error when the response has no access_token", async () => {
    const res = await exchangeCodeForToken(cfg, "c", "http://127.0.0.1:9", fakeFetch({ json: { foo: "bar" } }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("no access_token");
  });

  it("returns an error when fetch itself throws", async () => {
    const throwing: FetchLike = async () => { throw new Error("network down"); };
    const res = await exchangeCodeForToken(cfg, "c", "http://127.0.0.1:9", throwing);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("network down");
  });
});

describe("startMcpAuth (loopback end-to-end with mocked token exchange)", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-flow-"));
    env = { VANTA_HOME: home } as NodeJS.ProcessEnv;
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("returns a consent URL, then persists the token after the redirect", async () => {
    const started = await startMcpAuth("github", cfg, env, fakeFetch({ json: { access_token: "live-token" } }));
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const redirectUri = new URL(started.authUrl).searchParams.get("redirect_uri")!;
    // Simulate the provider redirecting the browser back with ?code.
    const res = await fetch(`${redirectUri}/?code=auth-code&state=github`);
    await res.text();
    await started.done; // the background exchange + persist
    expect((await loadMcpToken("github", env))?.access_token).toBe("live-token");
  });
});
