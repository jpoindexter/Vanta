import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTeamsActivityVerifier } from "./teams-auth.js";

const NOW = Date.parse("2026-07-10T00:00:00Z");
const APP_ID = "vanta-app";
const ISSUER = "https://api.botframework.com";
const SERVICE_URL = "https://smba.trafficmanager.net/teams";

function fixture(): {
  verifier: ReturnType<typeof createTeamsActivityVerifier>;
  sign: (claims?: Record<string, unknown>) => string;
  fetchCalls: () => number;
} {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  let calls = 0;
  const fetcher = async (input: string | URL | Request): Promise<Response> => {
    calls += 1;
    const url = String(input);
    if (url.endsWith("/openid")) {
      return Response.json({ issuer: ISSUER, jwks_uri: "https://bot.test/jwks" });
    }
    return Response.json({ keys: [{ ...jwk, kid: "key-1", alg: "RS256", use: "sig" }] });
  };
  const sign = (over: Record<string, unknown> = {}): string => {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "key-1" })).toString("base64url");
    const claims = Buffer.from(JSON.stringify({
      iss: ISSUER,
      aud: APP_ID,
      exp: Math.floor(NOW / 1000) + 600,
      nbf: Math.floor(NOW / 1000) - 10,
      serviceurl: SERVICE_URL,
      ...over,
    })).toString("base64url");
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${claims}`);
    signer.end();
    return `${header}.${claims}.${signer.sign(privateKey).toString("base64url")}`;
  };
  return {
    verifier: createTeamsActivityVerifier(APP_ID, {
      fetch: fetcher,
      now: () => NOW,
      openIdUrl: "https://bot.test/openid",
    }),
    sign,
    fetchCalls: () => calls,
  };
}

describe("createTeamsActivityVerifier", () => {
  it("verifies a Bot Framework RS256 token and caches OpenID keys", async () => {
    const f = fixture();
    const activity = { serviceUrl: SERVICE_URL };
    await expect(f.verifier(`Bearer ${f.sign()}`, activity)).resolves.toBe(true);
    await expect(f.verifier(`Bearer ${f.sign()}`, activity)).resolves.toBe(true);
    expect(f.fetchCalls()).toBe(2);
  });

  it("rejects missing auth, wrong audience, expiry, service URL mismatch, and tampering", async () => {
    const f = fixture();
    const activity = { serviceUrl: SERVICE_URL };
    await expect(f.verifier(undefined, activity)).resolves.toBe(false);
    await expect(f.verifier(`Bearer ${f.sign({ aud: "other-app" })}`, activity)).resolves.toBe(false);
    await expect(f.verifier(`Bearer ${f.sign({ exp: Math.floor(NOW / 1000) - 301 })}`, activity)).resolves.toBe(false);
    await expect(f.verifier(`Bearer ${f.sign()}`, { serviceUrl: "https://evil.test" })).resolves.toBe(false);
    await expect(f.verifier(`Bearer ${f.sign({ serviceurl: undefined })}`, activity)).resolves.toBe(false);
    const token = f.sign();
    const [header, claims, signature] = token.split(".") as [string, string, string];
    const tampered = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
    await expect(f.verifier(`Bearer ${header}.${claims}.${tampered}`, activity)).resolves.toBe(false);
  });
});
