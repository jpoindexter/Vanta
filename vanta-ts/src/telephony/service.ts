import { defaultExec } from "../secrets/provider.js";
import { resolveVaultSecretValue } from "../secrets/vault-manager.js";
import { parseTwilioCallback, validateTwilioSignature } from "./callbacks.js";
import { deleteTelephonyRecording, executeTelephonyAction, type TelephonyClientDeps, type TelephonyResult } from "./client.js";
import { appendTelephonyReceipt, buildRecordingDeletedReceipt, buildTelephonyCallbackReceipt, buildTelephonyReceipt, latestTelephonyStates, loadTelephonyReceipts, pruneTelephonyReceipts, withTelephonyReceiptLock } from "./receipts.js";
import { previewTelephonyAction, requiredTelephonyScope, telephonyEligibility, type TelephonyAction, type TelephonyProfile } from "./schema.js";

export type TelephonyExecutor = (action: TelephonyAction) => Promise<TelephonyResult>;
export type TelephonyServiceDeps = TelephonyClientDeps & { approve: (preview: string) => Promise<boolean>; execute?: TelephonyExecutor; now?: () => Date };
export type TelephonyExecution = { ok: boolean; state: string; preview: string; receiptRecorded: boolean };
export type CallbackInput = { profile: TelephonyProfile; url: string; params: Record<string, string>; signature: string };
export type CallbackDeps = { resolveToken?: (profile: TelephonyProfile, scope: string) => Promise<string | null>; now?: () => Date };

function issues(action: TelephonyAction, receipts: readonly { actionId: string }[], now: Date): string[] {
  const found = telephonyEligibility(action, now);
  if (receipts.some((receipt) => receipt.actionId === action.id)) found.push("action already has a receipt");
  return found;
}

async function record(root: string, action: TelephonyAction, input: Parameters<typeof buildTelephonyReceipt>[1]): Promise<void> {
  await appendTelephonyReceipt(root, buildTelephonyReceipt(action, input));
}

async function reserve(root: string, action: TelephonyAction, now: Date): Promise<string[]> {
  return withTelephonyReceiptLock(root, async () => {
    const blocked = issues(action, await loadTelephonyReceipts(root), now); if (blocked.length > 0) return blocked;
    await record(root, action, { at: now.toISOString(), status: "reserved", providerStatus: "reserved" }); return [];
  });
}

export async function executeTelephony(root: string, action: TelephonyAction, deps: TelephonyServiceDeps): Promise<TelephonyExecution> {
  const clock = deps.now ?? (() => new Date()), preview = previewTelephonyAction(action);
  const initial = issues(action, await loadTelephonyReceipts(root), clock());
  if (initial.length > 0) return { ok: false, state: `blocked: ${initial.join("; ")}`, preview, receiptRecorded: false };
  if (!await deps.approve(preview)) {
    await withTelephonyReceiptLock(root, () => record(root, action, { at: clock().toISOString(), status: "denied", providerStatus: "operator_denied" }));
    return { ok: false, state: "operator_denied", preview, receiptRecorded: true };
  }
  const afterApproval = await reserve(root, action, clock());
  if (afterApproval.length > 0) return { ok: false, state: `blocked: ${afterApproval.join("; ")}`, preview, receiptRecorded: false };
  let result: TelephonyResult;
  try { result = await (deps.execute ?? ((value) => executeTelephonyAction(value, deps)))(action); }
  catch { result = { ok: false, state: "client_error" }; }
  await withTelephonyReceiptLock(root, () => record(root, action, {
    at: clock().toISOString(), status: result.ok ? "accepted" : "failed",
    providerStatus: result.providerStatus ?? result.state, providerId: result.providerId,
  }));
  return { ok: result.ok, state: result.state, preview, receiptRecorded: true };
}

async function callbackToken(profile: TelephonyProfile, scope: string): Promise<string | null> {
  return resolveVaultSecretValue(profile.authTokenVaultAlias, `telephony:twilio:${profile.accountSid}:${scope}`, process.env, defaultExec);
}

export async function ingestTwilioCallback(root: string, input: CallbackInput, deps: CallbackDeps = {}): Promise<{ ok: boolean; state: string }> {
  const callback = parseTwilioCallback(input.params); if (!callback) return { ok: false, state: "invalid_callback" };
  if (callback.accountSid && callback.accountSid !== input.profile.accountSid) return { ok: false, state: "account_mismatch" };
  const scope = callback.kind === "message" ? "sms" : "voice";
  let token: string | null;
  try { token = await (deps.resolveToken ?? callbackToken)(input.profile, scope); } catch { return { ok: false, state: "credential_unavailable" }; }
  if (!token || !validateTwilioSignature(input.url, input.params, input.signature, token)) return { ok: false, state: "invalid_signature" };
  return withTelephonyReceiptLock(root, async () => {
    const prior = latestTelephonyStates(await loadTelephonyReceipts(root)).find((receipt) => receipt.providerId === callback.providerId);
    if (!prior) return { ok: false, state: "unknown_provider_id" };
    await appendTelephonyReceipt(root, buildTelephonyCallbackReceipt(prior, callback, (deps.now ?? (() => new Date()))().toISOString()));
    return { ok: true, state: callback.status };
  });
}

export async function applyTelephonyRetention(root: string, profile: TelephonyProfile, deps: {
  now?: () => Date; deleteRecording?: (recordingSid: string) => Promise<TelephonyResult>;
} & TelephonyClientDeps = {}): Promise<{ deletedRecordings: number; failedRecordings: number; prunedReceipts: number }> {
  return withTelephonyReceiptLock(root, async () => {
    const now = (deps.now ?? (() => new Date()))(), receipts = await loadTelephonyReceipts(root);
    const deleted = new Set(receipts.filter((receipt) => receipt.providerStatus === "recording_deleted").map((receipt) => receipt.recordingSid));
    const due = new Map(receipts.filter((receipt) => receipt.recordingSid && receipt.recordingRetainUntil && Date.parse(receipt.recordingRetainUntil) <= now.getTime() && !deleted.has(receipt.recordingSid)).map((receipt) => [receipt.recordingSid!, receipt]));
    let deletedRecordings = 0, failedRecordings = 0;
    for (const [sid, receipt] of due) {
      const result = await (deps.deleteRecording ?? ((value) => deleteTelephonyRecording(profile, value, deps)))(sid);
      if (!result.ok) { failedRecordings += 1; continue; }
      await appendTelephonyReceipt(root, buildRecordingDeletedReceipt(receipt, now.toISOString())); deletedRecordings += 1;
    }
    const prunedReceipts = failedRecordings === 0 ? await pruneTelephonyReceipts(root, now) : 0;
    return { deletedRecordings, failedRecordings, prunedReceipts };
  });
}
