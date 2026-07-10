import { createPublicKey, createVerify, type JsonWebKey } from "node:crypto";
import { z } from "zod";

const OPENID_URL = "https://login.botframework.com/v1/.well-known/openidconfiguration";
const CLOCK_SKEW_SECONDS = 300;
const CACHE_MS = 60 * 60 * 1000;

const OpenIdConfig = z.object({ issuer: z.string().url(), jwks_uri: z.string().url() });
const Jwk = z.object({ kid: z.string(), kty: z.literal("RSA") }).passthrough();
const Jwks = z.object({ keys: z.array(Jwk) });
const Header = z.object({ alg: z.literal("RS256"), kid: z.string() });
const Claims = z.object({
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  exp: z.number(),
  nbf: z.number().optional(),
  serviceurl: z.string().url(),
});

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type TeamsActivityVerifier = (authorization: string | undefined, activity: unknown) => Promise<boolean>;

type CachedKeys = {
  issuer: string;
  keys: Map<string, z.infer<typeof Jwk>>;
  expiresAt: number;
};

function decodeJson(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

function audienceIncludes(audience: string | string[], appId: string): boolean {
  return Array.isArray(audience) ? audience.includes(appId) : audience === appId;
}

function activityServiceUrl(activity: unknown): string | undefined {
  if (!activity || typeof activity !== "object") return undefined;
  const value = (activity as Record<string, unknown>).serviceUrl;
  return typeof value === "string" ? value : undefined;
}

function bearerToken(authorization: string | undefined): string | undefined {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

/** Validate Connector-to-bot JWTs against Microsoft's OpenID metadata and JWKS. */
export function createTeamsActivityVerifier(appId: string, opts: {
  fetch?: FetchLike;
  now?: () => number;
  openIdUrl?: string;
} = {}): TeamsActivityVerifier {
  const fetcher = opts.fetch ?? fetch;
  const now = opts.now ?? (() => Date.now());
  const openIdUrl = opts.openIdUrl ?? OPENID_URL;
  let cached: CachedKeys | undefined;

  const loadKeys = async (force = false): Promise<CachedKeys> => {
    if (!force && cached && cached.expiresAt > now()) return cached;
    const metadataResponse = await fetcher(openIdUrl, { signal: AbortSignal.timeout(5000) });
    if (!metadataResponse.ok) throw new Error("Bot Framework OpenID metadata unavailable");
    const metadata = OpenIdConfig.parse(await metadataResponse.json());
    const keysResponse = await fetcher(metadata.jwks_uri, { signal: AbortSignal.timeout(5000) });
    if (!keysResponse.ok) throw new Error("Bot Framework signing keys unavailable");
    const jwks = Jwks.parse(await keysResponse.json());
    cached = {
      issuer: metadata.issuer,
      keys: new Map(jwks.keys.map((key) => [key.kid, key])),
      expiresAt: now() + CACHE_MS,
    };
    return cached;
  };

  return async (authorization, activity) => {
    try {
      const token = bearerToken(authorization);
      if (!token) return false;
      const parts = token.split(".");
      if (parts.length !== 3) return false;
      const [encodedHeader, encodedClaims, encodedSignature] = parts as [string, string, string];
      const header = Header.parse(decodeJson(encodedHeader));
      const claims = Claims.parse(decodeJson(encodedClaims));
      let keySet = await loadKeys();
      let key = keySet.keys.get(header.kid);
      if (!key) {
        keySet = await loadKeys(true);
        key = keySet.keys.get(header.kid);
      }
      if (!key || claims.iss !== keySet.issuer || !audienceIncludes(claims.aud, appId)) return false;
      const nowSeconds = Math.floor(now() / 1000);
      if (claims.exp + CLOCK_SKEW_SECONDS < nowSeconds) return false;
      if (claims.nbf !== undefined && claims.nbf - CLOCK_SKEW_SECONDS > nowSeconds) return false;
      if (claims.serviceurl !== activityServiceUrl(activity)) return false;
      const verifier = createVerify("RSA-SHA256");
      verifier.update(`${encodedHeader}.${encodedClaims}`);
      verifier.end();
      return verifier.verify(
        createPublicKey({ key: key as JsonWebKey, format: "jwk" }),
        Buffer.from(encodedSignature, "base64url"),
      );
    } catch {
      return false;
    }
  };
}
