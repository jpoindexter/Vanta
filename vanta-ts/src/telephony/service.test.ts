import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { twilioSignature } from "./callbacks.js";
import { latestTelephonyStates, loadTelephonyReceipts } from "./receipts.js";
import { TelephonyActionSchema, TelephonyProfileSchema } from "./schema.js";
import { applyTelephonyRetention, executeTelephony, ingestTwilioCallback } from "./service.js";

const profile = TelephonyProfileSchema.parse({ version: 1, environment: "test", provider: "twilio", accountSid: `AC${"1".repeat(32)}`, authTokenVaultAlias: "TWILIO_TEST_TOKEN", from: "+15005550006", scopes: ["sms"] });
function action(id = "tel_service_1234") { return TelephonyActionSchema.parse({ version: 1, profile, id, idempotencyKey: "00000000-0000-4000-8000-000000000001", action: "sms", recipient: "+15005550009", purpose: "test", consent: { source: "test", obtainedAt: "2026-07-11T10:00:00Z", expiresAt: "2099-07-12T00:00:00Z" }, window: { notBefore: "2026-07-11T11:00:00Z", notAfter: "2099-07-11T13:00:00Z" }, expiresAt: "2099-07-11T13:00:00Z", statusCallbackUrl: "https://callbacks.example/twilio", retention: { receiptDays: 30, transcriptDays: 0 }, body: "hello" }); }
const now = () => new Date("2026-07-11T12:00:00Z");

describe("telephony service", () => {
  it("records fresh-approval denial without executing", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-tel-service-")), execute = vi.fn();
    expect(await executeTelephony(root, action(), { approve: async () => false, execute, now })).toMatchObject({ ok: false, state: "operator_denied" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("reserves and records accepted provider result, then refuses replay", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-tel-service-")), execute = vi.fn(async () => ({ ok: true, state: "accepted", providerId: `SM${"a".repeat(32)}`, providerStatus: "queued" }));
    expect(await executeTelephony(root, action(), { approve: async () => true, execute, now })).toMatchObject({ ok: true, state: "accepted" });
    expect((await loadTelephonyReceipts(root)).map((receipt) => receipt.status)).toEqual(["reserved", "accepted"]);
    execute.mockClear(); expect((await executeTelephony(root, action(), { approve: async () => true, execute, now })).ok).toBe(false); expect(execute).not.toHaveBeenCalled();
  });

  it("authenticates and correlates out-of-order callbacks", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-tel-service-")), providerId = `SM${"a".repeat(32)}`, url = "https://callbacks.example/twilio", token = "fixture-token";
    await executeTelephony(root, action(), { approve: async () => true, execute: async () => ({ ok: true, state: "accepted", providerId, providerStatus: "queued" }), now });
    const delivered = { MessageSid: providerId, MessageStatus: "delivered", SequenceNumber: "3", AccountSid: profile.accountSid };
    const sent = { MessageSid: providerId, MessageStatus: "sent", SequenceNumber: "2", AccountSid: profile.accountSid };
    for (const params of [delivered, sent]) expect(await ingestTwilioCallback(root, { profile, url, params, signature: twilioSignature(url, params, token) }, { resolveToken: async () => token, now })).toMatchObject({ ok: true });
    expect(latestTelephonyStates(await loadTelephonyReceipts(root)).find((receipt) => receipt.providerId === providerId)?.providerStatus).toBe("delivered");
  });

  it("rejects invalid signatures before writing callback state", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-tel-service-")), params = { MessageSid: `SM${"a".repeat(32)}`, MessageStatus: "delivered" };
    expect(await ingestTwilioCallback(root, { profile, url: "https://callbacks.example/twilio", params, signature: "bad" }, { resolveToken: async () => "token" })).toEqual({ ok: false, state: "invalid_signature" });
    expect(await loadTelephonyReceipts(root)).toEqual([]);
  });

  it("deletes expired provider recordings once before pruning local receipts", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-tel-service-"));
    const voiceProfile = { ...profile, scopes: ["voice" as const] };
    const sms = action("tel_recording_123"); if (sms.action !== "sms") throw new Error("fixture mismatch");
    const { body: _body, ...base } = sms;
    const call = TelephonyActionSchema.parse({ ...base, profile: voiceProfile, action: "call", spokenMessage: "test", maximumDurationSeconds: 20, recording: { enabled: true, consentAt: "2026-07-11T10:00:00Z", disclosure: "This test call is recorded.", retentionDays: 1 }, statusCallbackUrl: "https://callbacks.example/twilio", retention: { receiptDays: 30, transcriptDays: 1 } });
    const providerId = `CA${"b".repeat(32)}`, recordingSid = `RE${"c".repeat(32)}`;
    await executeTelephony(root, call, { approve: async () => true, execute: async () => ({ ok: true, state: "accepted", providerId, providerStatus: "queued" }), now });
    const params = { CallSid: providerId, RecordingSid: recordingSid, RecordingStatus: "completed" }, url = "https://callbacks.example/twilio", token = "token";
    await ingestTwilioCallback(root, { profile: voiceProfile, url, params, signature: twilioSignature(url, params, token) }, { resolveToken: async () => token, now });
    const remove = vi.fn(async () => ({ ok: true, state: "recording_deleted" }));
    expect(await applyTelephonyRetention(root, voiceProfile, { now: () => new Date("2026-07-13T12:00:00Z"), deleteRecording: remove })).toMatchObject({ deletedRecordings: 1, failedRecordings: 0 });
    expect(remove).toHaveBeenCalledWith(recordingSid);
    expect(await applyTelephonyRetention(root, voiceProfile, { now: () => new Date("2026-07-13T12:00:00Z"), deleteRecording: remove })).toMatchObject({ deletedRecordings: 0 });
  });

  it("keeps expired receipts when provider recording deletion fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-tel-retention-"));
    const voiceProfile = { ...profile, scopes: ["voice" as const] };
    const sms = action("tel_retention_123"); if (sms.action !== "sms") throw new Error("fixture mismatch");
    const { body: _body, ...base } = sms;
    const call = TelephonyActionSchema.parse({ ...base, profile: voiceProfile, action: "call", spokenMessage: "test", maximumDurationSeconds: 20, recording: { enabled: true, consentAt: "2026-07-11T10:00:00Z", disclosure: "This test call is recorded.", retentionDays: 1 }, statusCallbackUrl: "https://callbacks.example/twilio", retention: { receiptDays: 1, transcriptDays: 1 } });
    const providerId = `CA${"d".repeat(32)}`, recordingSid = `RE${"e".repeat(32)}`, token = "token", url = "https://callbacks.example/twilio";
    await executeTelephony(root, call, { approve: async () => true, execute: async () => ({ ok: true, state: "accepted", providerId, providerStatus: "queued" }), now });
    const params = { CallSid: providerId, RecordingSid: recordingSid, RecordingStatus: "completed" };
    await ingestTwilioCallback(root, { profile: voiceProfile, url, params, signature: twilioSignature(url, params, token) }, { resolveToken: async () => token, now });
    const result = await applyTelephonyRetention(root, voiceProfile, { now: () => new Date("2026-07-13T12:00:00Z"), deleteRecording: async () => ({ ok: false, state: "recording_delete_failed" }) });
    expect(result).toEqual({ deletedRecordings: 0, failedRecordings: 1, prunedReceipts: 0 });
    expect(await loadTelephonyReceipts(root)).not.toHaveLength(0);
  });
});
