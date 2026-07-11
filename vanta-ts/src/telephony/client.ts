import { defaultExec } from "../secrets/provider.js";
import { resolveVaultSecretValue } from "../secrets/vault-manager.js";
import { buildTelephonyForm, requiredTelephonyScope, type NumberSearch, type TelephonyAction, type TelephonyProfile } from "./schema.js";

export type TelephonyFetch = (input: string, init: RequestInit) => Promise<Response>;
export type TelephonyTokenResolver = (profile: TelephonyProfile, scope: string) => Promise<string | null>;
export type TelephonyClientDeps = { fetch?: TelephonyFetch; resolveToken?: TelephonyTokenResolver; apiBase?: string };
export type TelephonyResult = { ok: boolean; state: string; providerId?: string; providerStatus?: string; data?: unknown; httpStatus?: number };

async function defaultToken(profile: TelephonyProfile, scope: string): Promise<string | null> {
  return resolveVaultSecretValue(profile.authTokenVaultAlias, `telephony:twilio:${profile.accountSid}:${scope}`, process.env, defaultExec);
}

function testApiBase(deps: TelephonyClientDeps): string | null {
  const raw = deps.apiBase ?? process.env.VANTA_TELEPHONY_TEST_API_BASE;
  if (!raw) return null;
  try {
    const url = new URL(raw), local = ["127.0.0.1", "localhost"].includes(url.hostname);
    const twilio = url.hostname === "api.twilio.com" || url.hostname.endsWith(".twilio.com");
    return (url.protocol === "https:" && twilio) || (url.protocol === "http:" && local) ? raw.replace(/\/+$/, "") : null;
  } catch { return null; }
}

async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > 65_536) throw new Error("telephony response too large");
  const text = await response.text(); if (Buffer.byteLength(text) > 65_536) throw new Error("telephony response too large");
  const parsed = JSON.parse(text); if (!parsed || typeof parsed !== "object") throw new Error("invalid telephony response");
  return parsed as Record<string, unknown>;
}

async function request(
  profile: TelephonyProfile,
  options: { scope: string; path: string; init: RequestInit; deps: TelephonyClientDeps },
): Promise<{ ok: boolean; state: string; data?: Record<string, unknown>; httpStatus?: number }> {
  const base = testApiBase(options.deps); if (!base) return { ok: false, state: "test_adapter_unavailable" };
  let token: string | null;
  try { token = await (options.deps.resolveToken ?? defaultToken)(profile, options.scope); } catch { return { ok: false, state: "credential_unavailable" }; }
  if (!token) return { ok: false, state: "credential_unavailable" };
  try {
    const response = await (options.deps.fetch ?? fetch)(`${base}${options.path}`, {
      ...options.init, redirect: "manual", signal: AbortSignal.timeout(20_000),
      headers: { ...options.init.headers, authorization: `Basic ${Buffer.from(`${profile.accountSid}:${token}`).toString("base64")}` },
    });
    const data = await boundedJson(response);
    return response.ok ? { ok: true, state: "ok", data, httpStatus: response.status } : { ok: false, state: "http_error", httpStatus: response.status };
  } catch { return { ok: false, state: "transport_error" }; }
}

function actionPath(action: TelephonyAction): string {
  const root = `/Accounts/${action.profile.accountSid}`;
  if (action.action === "sms") return `${root}/Messages.json`;
  if (action.action === "call") return `${root}/Calls.json`;
  return `${root}/IncomingPhoneNumbers.json`;
}

function responseId(action: TelephonyAction, data: Record<string, unknown>): string | undefined {
  const id = typeof data.sid === "string" ? data.sid : undefined;
  const prefix = action.action === "sms" ? "SM" : action.action === "call" ? "CA" : "PN";
  return id?.startsWith(prefix) ? id : undefined;
}

export async function executeTelephonyAction(action: TelephonyAction, deps: TelephonyClientDeps = {}): Promise<TelephonyResult> {
  const result = await request(action.profile, {
    scope: requiredTelephonyScope(action.action), path: actionPath(action), deps,
    init: { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: buildTelephonyForm(action).toString() },
  });
  if (!result.ok || !result.data) return result;
  const providerId = responseId(action, result.data), status = typeof result.data.status === "string" ? result.data.status : "accepted";
  if (!providerId) return { ok: false, state: "invalid_provider_result", httpStatus: result.httpStatus };
  return { ok: true, state: "accepted", providerId, providerStatus: status, httpStatus: result.httpStatus };
}

function safeNumbers(data: Record<string, unknown>): unknown[] {
  const values = Array.isArray(data.available_phone_numbers) ? data.available_phone_numbers : [];
  return values.slice(0, 20).flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>, phoneNumber = typeof row.phone_number === "string" ? row.phone_number : null;
    if (!phoneNumber) return [];
    return [{ phoneNumber, friendlyName: typeof row.friendly_name === "string" ? row.friendly_name : phoneNumber, capabilities: row.capabilities && typeof row.capabilities === "object" ? row.capabilities : {} }];
  });
}

export async function searchTelephonyNumbers(search: NumberSearch, deps: TelephonyClientDeps = {}): Promise<TelephonyResult> {
  if (!search.profile.scopes.includes("numbers")) return { ok: false, state: "scope_denied" };
  const params = new URLSearchParams({ PageSize: String(search.limit) }); if (search.areaCode) params.set("AreaCode", search.areaCode);
  const path = `/Accounts/${search.profile.accountSid}/AvailablePhoneNumbers/${search.country}/Local.json?${params}`;
  const result = await request(search.profile, { scope: "numbers", path, init: { method: "GET" }, deps });
  return result.ok && result.data ? { ok: true, state: "ok", data: safeNumbers(result.data), httpStatus: result.httpStatus } : result;
}

export async function deleteTelephonyRecording(profile: TelephonyProfile, recordingSid: string, deps: TelephonyClientDeps = {}): Promise<TelephonyResult> {
  if (!profile.scopes.includes("voice")) return { ok: false, state: "scope_denied" };
  if (!/^RE[a-fA-F0-9]{32}$/.test(recordingSid)) return { ok: false, state: "invalid_recording_id" };
  const base = testApiBase(deps); if (!base) return { ok: false, state: "test_adapter_unavailable" };
  let token: string | null;
  try { token = await (deps.resolveToken ?? defaultToken)(profile, "voice"); } catch { return { ok: false, state: "credential_unavailable" }; }
  if (!token) return { ok: false, state: "credential_unavailable" };
  try {
    const response = await (deps.fetch ?? fetch)(`${base}/Accounts/${profile.accountSid}/Recordings/${recordingSid}.json`, {
      method: "DELETE", redirect: "manual", signal: AbortSignal.timeout(20_000),
      headers: { authorization: `Basic ${Buffer.from(`${profile.accountSid}:${token}`).toString("base64")}` },
    });
    return response.ok ? { ok: true, state: "recording_deleted", httpStatus: response.status } : { ok: false, state: "recording_delete_failed", httpStatus: response.status };
  } catch { return { ok: false, state: "transport_error" }; }
}
