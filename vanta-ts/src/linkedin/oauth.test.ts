import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LINKEDIN_AUTHORIZATION_URL,
  LINKEDIN_SCOPES,
  LINKEDIN_TOKEN_URL,
  type LinkedInFetch,
} from "./contract.js";
import { buildLinkedInAuthUrl, exchangeLinkedInCode, runLinkedInAuth } from "./oauth.js";
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
    expect(url.searchParams.get("scope")).toBe("w_member_social");
    expect(url.searchParams.get("scope")).not.toContain("openid");
  });

  it("exchanges the code with its verifier and never sends a client secret", async () => {
    const fetch = vi.fn(async () => response({ access_token: "access", expires_in: 5_184_000 })) as unknown as LinkedInFetch;
    const result = await exchangeLinkedInCode({
      clientId: "client-id",
      code: "authorization-code",
      codeVerifier: "verifier",
      redirectUri: "http://127.0.0.1:8765/linkedin/callback",
    }, fetch);
    expect(result).toEqual({ accessToken: "access", expiresIn: 5_184_000, scopes: ["w_member_social"] });
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe(LINKEDIN_TOKEN_URL);
    expect(init?.body).toContain("code_verifier=verifier");
    expect(init?.body).not.toContain("client_secret");
  });

  it("rejects malformed tokens and tokens without posting authority", async () => {
    const missingToken = vi.fn(async () => response({ expires_in: 5 })) as unknown as LinkedInFetch;
    await expect(exchangeLinkedInCode({ clientId: "c", code: "c", codeVerifier: "v", redirectUri: "r" }, missingToken)).rejects.toThrow("valid access token");
    const missingScope = vi.fn(async () => response({ access_token: "access", expires_in: 5, scope: "profile" })) as unknown as LinkedInFetch;
    await expect(exchangeLinkedInCode({ clientId: "c", code: "c", codeVerifier: "v", redirectUri: "r" }, missingScope)).rejects.toThrow("posting authority");
  });

  it("stores posting authority without an invalid OpenID identity request or token logging", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-linkedin-flow-"));
    const lines: string[] = [];
    const fetchApi = vi.fn(async () => response({
      access_token: "never-log-token",
      expires_in: 60,
      scope: "w_member_social",
    })) as unknown as LinkedInFetch;
    try {
      const authorization = await runLinkedInAuth({ VANTA_HOME: home }, {
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
      expect(authorization).toEqual({ expiresAt: 61_000, scopes: ["w_member_social"] });
      expect(fetchApi).toHaveBeenCalledTimes(1);
      const stored = await readFile(join(home, "linkedin-tokens.json"), "utf8");
      expect(JSON.parse(stored)).toEqual({
        accessToken: "never-log-token",
        clientId: "client-id",
        expiresAt: 61_000,
        scopes: ["w_member_social"],
        authorization: "member-posting",
      });
      expect(stored).not.toContain("subject");
      expect(stored).not.toContain("email");
      expect(lines.join("\n")).not.toContain("never-log-token");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
