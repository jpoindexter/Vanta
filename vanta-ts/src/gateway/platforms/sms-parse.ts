import { z } from "zod";
import type { InboundMessage } from "./base.js";

// Pure parse/build/allowlist/enable helpers for the SMS (Twilio) adapter (`sms.ts`).
// Split out so each file stays under the size gate; `sms.ts` re-exports these so the
// module path (`./sms.js`) is unchanged for importers. All fns here are pure and
// unit-tested offline — no network, no secret.

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

/** Strip control chars (keeping \n and \t) from untrusted inbound text. Pure. */
export function stripControl(text: string): string {
  return text.replace(CONTROL_CHARS, "");
}

// One Twilio inbound-SMS webhook form, after the caller parses the urlencoded body into an
// object. Tolerant: only the fields we route on are required; unknown extras (AccountSid,
// ToCountry, SmsStatus, NumMedia, …) are ignored by zod's default object parse. A status
// callback (no Body) fails the inner shape and is dropped by the parser below.
const TwilioInbound = z.object({
  From: z.string(),
  Body: z.string(),
  MessageSid: z.string().optional(),
  To: z.string().optional(),
});

/** Unwrap a Twilio webhook payload to its form array: a single form object OR a bare array. Pure. */
function formsOf(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") return [payload];
  return [];
}

/**
 * Parse a Twilio inbound-SMS webhook payload into inbound messages. Accepts a single form
 * object (Twilio POSTs one message per webhook) OR an array of them (a caller's batch). Keeps
 * only a form carrying a `Body` (message text) — a status callback (no Body) is SKIPPED.
 * Tolerant: a non-object/non-array, or any element missing From/Body, is dropped (garbage → []).
 * Inbound text is control-stripped. Pure.
 *
 * Twilio's {From, Body, MessageSid} map onto the shared `InboundMessage` contract
 * (`gateway/platforms/base.ts`): From → chatId (the conversation/routing key the send uses) AND
 * `from` (the sender, also the allowlist key), Body → text, MessageSid → id. SMS is 1:1 → isGroup
 * false.
 */
export function parseTwilioInbound(payload: unknown): InboundMessage[] {
  const messages: InboundMessage[] = [];
  for (const raw of formsOf(payload)) {
    const parsed = TwilioInbound.safeParse(raw);
    if (!parsed.success) continue; // missing From/Body → a status callback or garbage; skip
    const f = parsed.data;
    messages.push({
      chatId: f.From,
      from: f.From,
      text: stripControl(f.Body),
      id: f.MessageSid,
      isGroup: false,
    });
  }
  return messages;
}

// Twilio splits a long SMS into segments automatically, but caps a single API request's Body at
// 1600 chars; a longer reply is split by the caller before reaching here, so this slice is the
// per-message hard cap (a defensive backstop).
export const SMS_TEXT_LIMIT = 1600;

/**
 * Build the form body for POST .../Messages.json: To/From/Body. `to` is the chatId (the sender's
 * number — the reply destination); `from` is the configured Twilio sender number. The text is
 * control-stripped and capped at Twilio's 1600-char single-request limit (the caller splits a
 * long reply first; this is the per-message hard cap). Returned as a URLSearchParams so the
 * transport posts application/x-www-form-urlencoded (Twilio's required content type). Pure.
 */
export function buildSmsForm(to: string, from: string, text: string): URLSearchParams {
  return new URLSearchParams({
    To: to,
    From: from,
    Body: stripControl(text).slice(0, SMS_TEXT_LIMIT),
  });
}

/**
 * Parse the VANTA_SMS_ALLOWLIST sender-number allowlist (comma list). Empty/absent → an empty
 * set, which the adapter treats as "allow all". Pure.
 */
export function parseSmsAllowlist(env: NodeJS.ProcessEnv): Set<string> {
  return new Set(
    (env.VANTA_SMS_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * SMS is enabled when all three Twilio settings are configured: the account SID, the auth token,
 * and the sender number (VANTA_TWILIO_SID + VANTA_TWILIO_TOKEN + VANTA_TWILIO_FROM). Any missing =
 * disabled. Pure.
 */
export function smsEnabled(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.VANTA_TWILIO_SID?.trim() && env.VANTA_TWILIO_TOKEN?.trim() && env.VANTA_TWILIO_FROM?.trim(),
  );
}
