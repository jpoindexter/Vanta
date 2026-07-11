import { defaultExec } from "../secrets/provider.js";
import { resolveVaultSecretValue } from "../secrets/vault-manager.js";
import { buildMutationGraphql, buildReadGraphql, buildVerificationGraphql, missingMutationScopes, missingReadScopes, type ShopifyMutationPlan, type ShopifyProfile, type ShopifyReadRequest } from "./schema.js";

export type ShopifyFetch = (input: string, init: RequestInit) => Promise<Response>;
export type ShopifyTokenResolver = (profile: ShopifyProfile, access: "read" | "write") => Promise<string | null>;
export type ShopifyClientDeps = { fetch?: ShopifyFetch; resolveToken?: ShopifyTokenResolver; apiBase?: string };
export type ShopifyResult = { ok: boolean; state: string; data?: unknown; httpStatus?: number; userErrorCount?: number };

const MAX_RESPONSE_BYTES = 1024 * 1024;

async function defaultToken(profile: ShopifyProfile, access: "read" | "write"): Promise<string | null> {
  return resolveVaultSecretValue(profile.credentialVaultAlias, `shopify:${profile.store}:${access}`, process.env, defaultExec);
}

function endpoint(profile: ShopifyProfile, apiBase?: string): string {
  return apiBase ?? `https://${profile.store}/admin/api/${profile.apiVersion}/graphql.json`;
}

async function boundedJson(response: Response): Promise<unknown> {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_RESPONSE_BYTES) throw new Error("Shopify response exceeds 1 MiB");
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new Error("Shopify response exceeds 1 MiB");
  return JSON.parse(text);
}

async function graphql(
  profile: ShopifyProfile,
  body: { query: string; variables: unknown },
  access: "read" | "write",
  deps: ShopifyClientDeps,
): Promise<ShopifyResult> {
  let token: string | null;
  try { token = await (deps.resolveToken ?? defaultToken)(profile, access); }
  catch { return { ok: false, state: "credential_unavailable" }; }
  if (!token) return { ok: false, state: "credential_unavailable" };
  try {
    const response = await (deps.fetch ?? fetch)(endpoint(profile, deps.apiBase), {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(20_000),
      headers: { "content-type": "application/json", "x-shopify-access-token": token },
      body: JSON.stringify(body),
    });
    const parsed = await boundedJson(response) as { data?: unknown; errors?: unknown[] };
    if (!response.ok) return { ok: false, state: "http_error", httpStatus: response.status };
    if (Array.isArray(parsed.errors) && parsed.errors.length > 0) return { ok: false, state: "graphql_error", httpStatus: response.status };
    return { ok: true, state: "ok", data: parsed.data, httpStatus: response.status };
  } catch { return { ok: false, state: "transport_error" }; }
}

export async function readShopify(
  profile: ShopifyProfile,
  request: ShopifyReadRequest,
  deps: ShopifyClientDeps = {},
): Promise<ShopifyResult> {
  if (missingReadScopes(profile, request).length > 0) return { ok: false, state: "scope_denied" };
  return graphql(profile, buildReadGraphql(request), "read", deps);
}

function mutationPayload(result: ShopifyResult, key: string): Record<string, unknown> | null {
  if (!result.ok || !result.data || typeof result.data !== "object") return null;
  const value = (result.data as Record<string, unknown>)[key];
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function userErrorCount(payload: Record<string, unknown> | null): number {
  return Array.isArray(payload?.userErrors) ? payload.userErrors.length : 0;
}

function productVerified(plan: Extract<ShopifyMutationPlan, { operation: "product_update" }>, object: Record<string, unknown>): boolean {
  return object.id === plan.input.id
    && (plan.input.title === undefined || object.title === plan.input.title)
    && (plan.input.status === undefined || object.status === plan.input.status);
}

function verified(plan: ShopifyMutationPlan, data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const operation = buildVerificationGraphql(plan);
  const object = (data as Record<string, unknown>)[operation.resultKey];
  if (!object || typeof object !== "object") return false;
  if (plan.operation === "product_update") return productVerified(plan, object as Record<string, unknown>);
  const level = (object as { inventoryLevel?: { quantities?: Array<{ name?: string; quantity?: number }> } }).inventoryLevel;
  return level?.quantities?.some((quantity) => quantity.name === "available" && quantity.quantity === plan.input.quantity) ?? false;
}

export async function mutateShopify(plan: ShopifyMutationPlan, deps: ShopifyClientDeps = {}): Promise<ShopifyResult> {
  if (Date.parse(plan.expiresAt) <= Date.now()) return { ok: false, state: "plan_expired" };
  if (missingMutationScopes(plan).length > 0) return { ok: false, state: "scope_denied" };
  const operation = buildMutationGraphql(plan);
  const result = await graphql(plan.profile, operation, "write", deps);
  if (!result.ok) return result;
  const count = userErrorCount(mutationPayload(result, operation.resultKey));
  if (count > 0) return { ok: false, state: "user_errors", httpStatus: result.httpStatus, userErrorCount: count };
  const verification = buildVerificationGraphql(plan);
  const checked = await graphql(plan.profile, verification, "read", deps);
  if (!checked.ok) return { ...checked, state: "verification_failed" };
  return { ok: verified(plan, checked.data), state: verified(plan, checked.data) ? "verified" : "verification_mismatch", data: checked.data, httpStatus: checked.httpStatus, userErrorCount: 0 };
}
