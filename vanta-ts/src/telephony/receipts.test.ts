import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TelephonyActionSchema, TelephonyProfileSchema } from "./schema.js";
import { appendTelephonyReceipt, buildTelephonyReceipt, latestTelephonyStates, loadTelephonyReceipts, pruneTelephonyReceipts, telephonyReceiptPath } from "./receipts.js";

const profile = TelephonyProfileSchema.parse({ version: 1, environment: "test", provider: "twilio", accountSid: `AC${"1".repeat(32)}`, authTokenVaultAlias: "TWILIO_TEST_TOKEN", from: "+15005550006", scopes: ["sms"] });
const action = TelephonyActionSchema.parse({ version: 1, profile, id: "tel_receipt_1234", idempotencyKey: "00000000-0000-4000-8000-000000000001", action: "sms", recipient: "+15005550009", purpose: "test", consent: { source: "test", obtainedAt: "2026-07-11T10:00:00Z", expiresAt: "2099-07-12T00:00:00Z" }, window: { notBefore: "2026-07-11T11:00:00Z", notAfter: "2099-07-11T13:00:00Z" }, expiresAt: "2099-07-11T13:00:00Z", statusCallbackUrl: "https://callbacks.example/twilio", retention: { receiptDays: 1, transcriptDays: 0 }, body: "secret message body" });

describe("telephony receipts", () => {
  it("stores hashes and lifecycle state without phone numbers, content, or credentials", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-tel-receipts-"));
    await appendTelephonyReceipt(root, buildTelephonyReceipt(action, { at: "2026-07-11T12:00:00Z", status: "accepted", providerStatus: "queued", providerId: `SM${"a".repeat(32)}` }));
    const raw = JSON.stringify(await loadTelephonyReceipts(root));
    expect(raw).not.toMatch(/15005550009|secret message body|TWILIO_TEST_TOKEN/); expect((await stat(telephonyReceiptPath(root))).mode & 0o777).toBe(0o600);
  });

  it("keeps terminal callback state when callbacks arrive out of order", () => {
    const id = `SM${"a".repeat(32)}`;
    const delivered = buildTelephonyReceipt(action, { at: "2026-07-11T12:02:00Z", status: "callback", providerStatus: "delivered", callback: { kind: "message", providerId: id, status: "delivered", sequence: 3 } });
    const sentLate = buildTelephonyReceipt(action, { at: "2026-07-11T12:03:00Z", status: "callback", providerStatus: "sent", callback: { kind: "message", providerId: id, status: "sent", sequence: 2 } });
    expect(latestTelephonyStates([delivered, sentLate])[0]?.providerStatus).toBe("delivered");
  });

  it("prunes receipts after their configured retention deadline", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-tel-receipts-"));
    await appendTelephonyReceipt(root, buildTelephonyReceipt(action, { at: "2026-07-11T12:00:00Z", status: "accepted", providerStatus: "queued" }));
    expect(await pruneTelephonyReceipts(root, new Date("2026-07-13T12:00:00Z"))).toBe(1); expect(await loadTelephonyReceipts(root)).toEqual([]);
  });
});
