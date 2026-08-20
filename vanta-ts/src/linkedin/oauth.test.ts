import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LINKEDIN_AUTHORIZATION_URL,
  LINKEDIN_SCOPES,
  LINKEDIN_TOKEN_URL,
  LINKEDIN_USERINFO_URL,
  type LinkedInFetch,
} from "./contract.js";
import { buildLinkedInAuthUrl, exchangeLinkedInCode, fetchLinkedInIdentity, runLinkedInAuth } from "./oauth.js";
import { challengeForVerifier, createOAuthState, createPkcePair } from "./pkce.js";

function response(json: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => json };
}

describe("LinkedIn native PKCE", () => {
  it("generates RFC 7636 verifier, challenge, and state values", () => {
    const pair = createPkcePair();
    expect(pair.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pair.verifier.length).toBeLessThanOrEqual(128);
    expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(pair.challenge).toBe(challengeForVerifier(pair.verifier));
    expect(createOAuthState()).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });

  it("builds the official native authorization URL with exact scopes", () => {
    const value = buildLinkedInAuthUrl({
      clientId: "client-id",
      redirectUri: "http://127.0.0.1:8765/linkedin/callback",
      state: "state-value",
      codeChallenge: "challenge-value",
    });
    const url = new URL(value);
    expect(`${url.origin}${url.pathname}`).toBe(LINKEDIN_AUTHORIZATION_URL);
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(LINKEDIN_SCOPES);
  });

  it("exchanges the code with its verifier and never sends a client secret", async () => {
    const fetch = vi.fn(async () => response({ access_token: "access", expires_in: 5_184_000 })) as unknown as LinkedInFetch;
    const result = await exchangeLinkedInCode({
      clientId: "client-id",
      code: "authorization-code",
      codeVerifier: "verifier",
      redirectUri: "http://127.0.0.1:8765/linkedin/callback",
    }, fetch);
    expect(result).toEqual({ accessToken: "access", expiresIn: 5_184_000 });
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe(LINKEDIN_TOKEN_URL);
    expect(init?.body).toContain("code_verifier=verifier");
    expect(init?.body).not.toContain("client_secret");
  });

  it("verifies the personal member through OpenID userinfo", async () => {
    const fetch = vi.fn(async () => response({ sub: "member-1", name: "Jason" })) as unknown as LinkedInFetch;
    await expect(fetchLinkedInIdentity("access", fetch)).resolves.toMatchObject({ sub: "member-1", name: "Jason" });
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe(LINKEDIN_USERINFO_URL);
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer access");
  });

  it("rejects malformed token and identity responses", async () => {
    const missingToken = vi.fn(async () => response({ expires_in: 5 })) as unknown as LinkedInFetch;
    await expect(exchangeLinkedInCode({ clientId: "c", code: "c", codeVerifier: "v", redirectUri: "r" }, missingToken)).rejects.toThrow("valid access token");
    const missingSubject = vi.fn(async () => response({ name: "No subject" })) as unknown as LinkedInFetch;
    await expect(fetchLinkedInIdentity("access", missingSubject)).rejects.toThrow("member identifier");
  });

  it("completes the loopback flow and stores the verified identity without logging its token", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-linkedin-flow-"));
    const lines: string[] = [];
    const fetchApi = vi.fn(async (url: string) => url === LINKEDIN_TOKEN_URL
      ? response({ access_token: "never-log-token", expires_in: 60 })
      : response({ sub: "member-1", name: "Jason" })) as unknown as LinkedInFetch;
    try {
      const identity = await runLinkedInAuth({ VANTA_HOME: home }, {
        clientId: "client-id",
        fetch: fetchApi,
        now: () => 1_000,
        notify: (line) => lines.push(line),
        openUrl: async (authUrl) => {
          const state = new URL(authUrl).searchParams.get("state");
          const callback = await fetch(`http://127.0.0.1:8765/linkedin/callback?code=code&state=${state}`);
          await callback.text();
        },
      });
      expect(identity).toMatchObject({ sub: "member-1", name: "Jason" });
      const stored = await readFile(join(home, "linkedin-tokens.json"), "utf8");
      expect(JSON.parse(stored)).toMatchObject({ subject: "member-1", expiresAt: 61_000 });
      expect(lines.join("\n")).not.toContain("never-log-token");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
