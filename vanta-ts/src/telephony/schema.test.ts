import { describe, expect, it } from "vitest";
import { NumberSearchSchema, TelephonyActionSchema, TelephonyProfileSchema, buildTelephonyForm, previewTelephonyAction, telephonyEligibility } from "./schema.js";

const profile = TelephonyProfileSchema.parse({ version: 1, environment: "test", provider: "twilio", accountSid: `AC${"1".repeat(32)}`, authTokenVaultAlias: "TWILIO_TEST_TOKEN", from: "+15005550006", scopes: ["numbers", "sms", "voice"] });
const common = { version: 1, profile, idempotencyKey: "00000000-0000-4000-8000-000000000001", purpose: "test notification", window: { notBefore: "2026-07-11T11:00:00Z", notAfter: "2026-07-11T13:00:00Z" }, expiresAt: "2026-07-11T13:00:00Z", retention: { receiptDays: 30, transcriptDays: 0 } };

describe("telephony contract", () => {
  it("builds an SMS form by reusing the existing SMS wire format", () => {
    const action = TelephonyActionSchema.parse({ ...common, id: "tel_sms_12345678", action: "sms", recipient: "+15005550009", consent: { source: "owner requested test", obtainedAt: "2026-07-11T10:00:00Z", expiresAt: "2026-07-12T00:00:00Z" }, statusCallbackUrl: "https://callbacks.example/twilio", body: "hello" });
    expect(Object.fromEntries(buildTelephonyForm(action))).toMatchObject({ To: "+15005550009", From: "+15005550006", Body: "hello", StatusCallback: "https://callbacks.example/twilio" });
    expect(telephonyEligibility(action, new Date("2026-07-11T12:00:00Z"))).toEqual([]);
  });

  it("builds a bounded call with recording off by default and escaped TwiML", () => {
    const action = TelephonyActionSchema.parse({ ...common, id: "tel_call_1234567", action: "call", recipient: "+15005550009", consent: { source: "owner requested call", obtainedAt: "2026-07-11T10:00:00Z", expiresAt: "2026-07-12T00:00:00Z" }, statusCallbackUrl: "https://callbacks.example/twilio", spokenMessage: "A < B & C", maximumDurationSeconds: 30, recording: { enabled: false } });
    const form = buildTelephonyForm(action);
    expect(form.get("Twiml")).toContain("A &lt; B &amp; C"); expect(form.get("Record")).toBe("false"); expect(form.get("TimeLimit")).toBe("30");
    expect(previewTelephonyAction(action)).toContain("recording: false");
  });

  it("rejects missing scope, expired consent, and an invalid time window", () => {
    const action = TelephonyActionSchema.parse({ ...common, profile: { ...profile, scopes: ["numbers"] }, id: "tel_sms_blocked1", action: "sms", recipient: "+15005550009", consent: { source: "old", obtainedAt: "2026-07-10T10:00:00Z", expiresAt: "2026-07-11T11:00:00Z" }, statusCallbackUrl: "https://callbacks.example/twilio", body: "hello", window: { notBefore: "2026-07-11T13:00:00Z", notAfter: "2026-07-11T12:30:00Z" } });
    expect(telephonyEligibility(action, new Date("2026-07-11T12:00:00Z"))).toEqual(["missing scope sms", "outside allowed time window", "invalid time window", "consent expired"]);
  });

  it("accepts bounded number search and rejects secrets in profiles", () => {
    expect(NumberSearchSchema.parse({ profile, areaCode: "415" })).toMatchObject({ country: "US", limit: 5 });
    expect(TelephonyProfileSchema.safeParse({ ...profile, authToken: "secret" }).success).toBe(false);
  });
});
