import { createHash } from "node:crypto";
import { z } from "zod";
import { buildSmsForm } from "../gateway/platforms/sms.js";

const E164 = z.string().regex(/^\+[1-9]\d{7,14}$/);
const safeText = (max: number) => z.string().trim().min(1).max(max).refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "control characters are not allowed");
const HttpsUrl = z.string().url().refine((value) => new URL(value).protocol === "https:", "callback URL must use HTTPS");
export const TelephonyScopeSchema = z.enum(["numbers", "sms", "voice"]);
export type TelephonyScope = z.infer<typeof TelephonyScopeSchema>;

export const TelephonyProfileSchema = z.object({
  version: z.literal(1), environment: z.literal("test"), provider: z.literal("twilio"),
  accountSid: z.string().regex(/^AC[0-9a-fA-F]{32}$/),
  authTokenVaultAlias: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/), from: E164,
  scopes: z.array(TelephonyScopeSchema).min(1).max(3).refine((scopes) => new Set(scopes).size === scopes.length),
}).strict();
export type TelephonyProfile = z.infer<typeof TelephonyProfileSchema>;

const Consent = z.object({
  source: safeText(240), obtainedAt: z.string().datetime({ offset: true }), expiresAt: z.string().datetime({ offset: true }),
}).strict();
const Window = z.object({ notBefore: z.string().datetime({ offset: true }), notAfter: z.string().datetime({ offset: true }) }).strict();
const Retention = z.object({ receiptDays: z.number().int().min(1).max(365), transcriptDays: z.number().int().min(0).max(30) }).strict();
const Base = z.object({
  version: z.literal(1), profile: TelephonyProfileSchema,
  id: z.string().regex(/^tel_[a-zA-Z0-9_-]{8,80}$/), idempotencyKey: z.string().uuid(),
  purpose: safeText(240), window: Window, expiresAt: z.string().datetime({ offset: true }), retention: Retention,
}).strict();
const ContactBase = Base.extend({ recipient: E164, consent: Consent, statusCallbackUrl: HttpsUrl }).strict();
const Sms = ContactBase.extend({ action: z.literal("sms"), body: safeText(1600) }).strict();
const Recording = z.discriminatedUnion("enabled", [
  z.object({ enabled: z.literal(false) }).strict(),
  z.object({ enabled: z.literal(true), consentAt: z.string().datetime({ offset: true }), disclosure: safeText(240), retentionDays: z.number().int().min(1).max(30) }).strict(),
]);
const Call = ContactBase.extend({
  action: z.literal("call"), spokenMessage: safeText(1000), maximumDurationSeconds: z.number().int().min(10).max(3600), recording: Recording,
}).strict();
const Provision = Base.extend({
  action: z.literal("number_provision"), phoneNumber: E164, voiceCallbackUrl: HttpsUrl, smsCallbackUrl: HttpsUrl,
}).strict();
export const TelephonyActionSchema = z.discriminatedUnion("action", [Sms, Call, Provision]);
export type TelephonyAction = z.infer<typeof TelephonyActionSchema>;

export const NumberSearchSchema = z.object({
  profile: TelephonyProfileSchema, country: z.string().regex(/^[A-Z]{2}$/).default("US"),
  areaCode: z.string().regex(/^\d{3}$/).optional(), limit: z.number().int().min(1).max(20).default(5),
}).strict();
export type NumberSearch = z.infer<typeof NumberSearchSchema>;

export function requiredTelephonyScope(action: TelephonyAction["action"] | "number_search"): TelephonyScope {
  if (action === "sms") return "sms";
  if (action === "call") return "voice";
  return "numbers";
}

function consentIssues(action: Exclude<TelephonyAction, { action: "number_provision" }>, time: number): string[] {
  const checks: Array<[boolean, string]> = [
    [Date.parse(action.consent.obtainedAt) > time, "consent is future-dated"],
    [Date.parse(action.consent.expiresAt) <= time, "consent expired"],
    [action.action === "call" && action.recording.enabled && Date.parse(action.recording.consentAt) > time, "recording consent is future-dated"],
  ];
  return checks.filter(([failed]) => failed).map(([, message]) => message);
}

export function telephonyEligibility(action: TelephonyAction, now = new Date()): string[] {
  const issues: string[] = [], time = now.getTime();
  if (!action.profile.scopes.includes(requiredTelephonyScope(action.action))) issues.push(`missing scope ${requiredTelephonyScope(action.action)}`);
  if (Date.parse(action.expiresAt) <= time) issues.push("action expired");
  if (Date.parse(action.window.notBefore) > time || Date.parse(action.window.notAfter) < time) issues.push("outside allowed time window");
  if (Date.parse(action.window.notBefore) >= Date.parse(action.window.notAfter)) issues.push("invalid time window");
  if (action.action !== "number_provision") issues.push(...consentIssues(action, time));
  return issues;
}

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

export function buildTelephonyForm(action: TelephonyAction): URLSearchParams {
  if (action.action === "sms") {
    const form = buildSmsForm(action.recipient, action.profile.from, action.body); form.set("StatusCallback", action.statusCallbackUrl); return form;
  }
  if (action.action === "number_provision") return new URLSearchParams({ PhoneNumber: action.phoneNumber, VoiceUrl: action.voiceCallbackUrl, SmsUrl: action.smsCallbackUrl });
  const speech = action.recording.enabled ? `${action.recording.disclosure} ${action.spokenMessage}` : action.spokenMessage;
  return new URLSearchParams({
    To: action.recipient, From: action.profile.from, Twiml: `<Response><Say>${xml(speech)}</Say></Response>`,
    TimeLimit: String(action.maximumDurationSeconds), StatusCallback: action.statusCallbackUrl,
    StatusCallbackEvent: "initiated ringing answered completed", Record: String(action.recording.enabled),
    ...(action.recording.enabled ? { RecordingStatusCallback: action.statusCallbackUrl, RecordingStatusCallbackEvent: "completed absent" } : {}),
  });
}

export function hashTelephonyAction(action: TelephonyAction): string {
  return createHash("sha256").update(JSON.stringify(action)).digest("hex");
}

export function previewTelephonyAction(action: TelephonyAction): string {
  return [
    `${action.action} via ${action.profile.provider} (${action.profile.environment})`,
    `target: ${action.action === "number_provision" ? action.phoneNumber : action.recipient}`,
    `purpose: ${action.purpose}`, `window: ${action.window.notBefore} -> ${action.window.notAfter}`,
    `recording: ${action.action === "call" ? action.recording.enabled : false}`,
    `retention: receipt ${action.retention.receiptDays}d / transcript ${action.retention.transcriptDays}d`,
    `idempotency: ${action.idempotencyKey}`, `action: ${action.id}`,
  ].join("\n");
}
