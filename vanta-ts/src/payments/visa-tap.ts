import { createHash, randomUUID, sign, verify, type KeyObject } from "node:crypto";

export const VISA_TAP_TAGS = {
  browse: "agent-browser-auth",
  payment: "agent-payer-auth",
} as const;

export type VisaTapOperation = keyof typeof VISA_TAP_TAGS;
export type VisaTapIdentifier = "consumer_token" | "payment_account_reference" | "loyalty_id";
export type VisaTapRequest = {
  authority: string;
  path: string;
  body?: string;
};
export type VisaTapHeaders = { signatureInput: string; signature: string; contentDigest?: string };
export type VisaTapRegistryKey = { keyId: string; algorithm: "ed25519"; publicKey: KeyObject };
export type VisaTapRegistry = { origin: string; getKey: (keyId: string) => Promise<VisaTapRegistryKey | null> };
export type VisaTapReplayStore = { claim: (nonce: string, expires: number) => Promise<boolean> };
export type VisaTapVerification = { ok: true; operation: VisaTapOperation; keyId: string } | { ok: false; reason: string };

type ParsedSignatureInput = {
  components: string[];
  created: number;
  expires: number;
  keyId: string;
  nonce: string;
  operation: VisaTapOperation;
  params: string;
};

const SAFE_AUTHORITY = /^[a-z0-9.-]+(?::[0-9]{1,5})?$/i;
const SAFE_KEY_ID = /^[a-zA-Z0-9._:-]{3,128}$/;
const SAFE_NONCE = /^[a-zA-Z0-9_-]{8,128}$/;

function validateRequest(request: VisaTapRequest): void {
  if (!SAFE_AUTHORITY.test(request.authority)) throw new Error("invalid TAP authority");
  if (!request.path.startsWith("/") || request.path.includes("#") || /[\u0000-\u001f\u007f]/.test(request.path)) {
    throw new Error("invalid TAP path");
  }
}

function contentDigest(body: string): string {
  return `sha-256=:${createHash("sha256").update(body).digest("base64")}:`;
}

function signatureBase(request: VisaTapRequest, components: readonly string[], params: string, digest?: string): string {
  const values: Record<string, string | undefined> = {
    "@authority": request.authority,
    "@path": request.path,
    "content-digest": digest,
  };
  return [
    ...components.map((component) => `"${component}": ${values[component] ?? ""}`),
    `"@signature-params": ${params}`,
  ].join("\n");
}

function parseSignatureInput(value: string): ParsedSignatureInput | null {
  const match = /^sig2=\(([^)]*)\);created=(\d+);expires=(\d+);keyId="([^"]+)";alg="ed25519";nonce="([^"]+)";tag="(agent-browser-auth|agent-payer-auth)"$/.exec(value);
  if (!match) return null;
  const components = [...match[1]!.matchAll(/"([^"]+)"/g)].map((component) => component[1]!);
  const operation = match[6] === VISA_TAP_TAGS.payment ? "payment" : "browse";
  const params = value.slice("sig2=".length);
  return {
    components,
    created: Number(match[2]),
    expires: Number(match[3]),
    keyId: match[4]!,
    nonce: match[5]!,
    operation,
    params,
  };
}

function parseSignature(value: string): Buffer | null {
  const match = /^sig2=:([a-zA-Z0-9+/=]+):$/.exec(value);
  if (!match) return null;
  const bytes = Buffer.from(match[1]!, "base64");
  return bytes.length === 64 ? bytes : null;
}

export function signVisaTapRequest(input: {
  request: VisaTapRequest;
  operation: VisaTapOperation;
  keyId: string;
  privateKey: KeyObject;
  created: number;
  expires: number;
  nonce?: string;
}): VisaTapHeaders {
  validateRequest(input.request);
  if (!SAFE_KEY_ID.test(input.keyId)) throw new Error("invalid TAP key ID");
  if (!Number.isSafeInteger(input.created) || !Number.isSafeInteger(input.expires) || input.expires <= input.created || input.expires - input.created > 300) {
    throw new Error("invalid TAP signature window");
  }
  const nonce = input.nonce ?? randomUUID();
  if (!SAFE_NONCE.test(nonce)) throw new Error("invalid TAP nonce");
  const digest = input.request.body === undefined ? undefined : contentDigest(input.request.body);
  const components = digest ? ["@authority", "@path", "content-digest"] : ["@authority", "@path"];
  const params = `(${components.map((component) => `"${component}"`).join(" ")});created=${input.created};expires=${input.expires};keyId="${input.keyId}";alg="ed25519";nonce="${nonce}";tag="${VISA_TAP_TAGS[input.operation]}"`;
  const bytes = sign(null, Buffer.from(signatureBase(input.request, components, params, digest)), input.privateKey);
  return {
    signatureInput: `sig2=${params}`,
    signature: `sig2=:${bytes.toString("base64")}:`,
    contentDigest: digest,
  };
}

export async function verifyVisaTapRequest(input: {
  request: VisaTapRequest;
  headers: VisaTapHeaders;
  expectedOperation: VisaTapOperation;
  registry: VisaTapRegistry;
  pinnedRegistryOrigin: string;
  replay: VisaTapReplayStore;
  now: number;
}): Promise<VisaTapVerification> {
  try { validateRequest(input.request); } catch { return { ok: false, reason: "invalid_request" }; }
  if (input.registry.origin !== input.pinnedRegistryOrigin) return { ok: false, reason: "registry_origin_mismatch" };
  const parsed = parseSignatureInput(input.headers.signatureInput);
  const signature = parseSignature(input.headers.signature);
  if (!parsed || !signature) return { ok: false, reason: "invalid_signature_headers" };
  if (!SAFE_KEY_ID.test(parsed.keyId) || !SAFE_NONCE.test(parsed.nonce)) return { ok: false, reason: "invalid_signature_parameters" };
  if (parsed.operation !== input.expectedOperation) return { ok: false, reason: "operation_mismatch" };
  if (parsed.created > input.now + 30 || parsed.expires < input.now || parsed.expires <= parsed.created || parsed.expires - parsed.created > 300) {
    return { ok: false, reason: "signature_expired" };
  }
  const expectedComponents = input.request.body === undefined
    ? ["@authority", "@path"]
    : ["@authority", "@path", "content-digest"];
  if (parsed.components.join("\n") !== expectedComponents.join("\n")) return { ok: false, reason: "components_mismatch" };
  const digest = input.request.body === undefined ? undefined : contentDigest(input.request.body);
  if (digest !== input.headers.contentDigest) return { ok: false, reason: "content_digest_mismatch" };
  const key = await input.registry.getKey(parsed.keyId);
  if (!key || key.keyId !== parsed.keyId || key.algorithm !== "ed25519") return { ok: false, reason: "unknown_key" };
  const valid = verify(null, Buffer.from(signatureBase(input.request, parsed.components, parsed.params, digest)), key.publicKey, signature);
  if (!valid) return { ok: false, reason: "signature_invalid" };
  if (!await input.replay.claim(parsed.nonce, parsed.expires)) return { ok: false, reason: "replay_detected" };
  return { ok: true, operation: parsed.operation, keyId: parsed.keyId };
}

export function consentedVisaTapIdentifiers(
  identifiers: Partial<Record<VisaTapIdentifier, string>>,
  consent: ReadonlySet<VisaTapIdentifier>,
): Partial<Record<VisaTapIdentifier, string>> {
  const output: Partial<Record<VisaTapIdentifier, string>> = {};
  for (const name of ["consumer_token", "payment_account_reference", "loyalty_id"] as const) {
    const value = identifiers[name]?.trim();
    if (consent.has(name) && value && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value)) output[name] = value;
  }
  return output;
}

export async function acceptVisaTapMerchantRequest(input: Parameters<typeof verifyVisaTapRequest>[0] & {
  identifiers: Partial<Record<VisaTapIdentifier, string>>;
  consent: ReadonlySet<VisaTapIdentifier>;
}): Promise<{ verification: VisaTapVerification; identifiers: Partial<Record<VisaTapIdentifier, string>> }> {
  const verification = await verifyVisaTapRequest(input);
  return {
    verification,
    identifiers: verification.ok ? consentedVisaTapIdentifiers(input.identifiers, input.consent) : {},
  };
}

export function createMemoryVisaTapReplayStore(): VisaTapReplayStore {
  const used = new Map<string, number>();
  return {
    async claim(nonce, expires) {
      for (const [value, deadline] of used) if (deadline < expires - 300) used.delete(value);
      if (used.has(nonce)) return false;
      used.set(nonce, expires);
      return true;
    },
  };
}
