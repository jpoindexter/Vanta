import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";

// SMS adapter — connects Vanta to Twilio's Programmable Messaging (SMS) as a channel,
// on the same PlatformAdapter contract as Telegram/LINE/WhatsApp. The live API (Twilio's
// inbound webhook for received SMS + a Messages.json POST for outbound) is the injected
// boundary: the pure parse/build/allowlist fns are unit-tested offline; the transport
// ({poll, push}) is supplied by the caller (a real Twilio number live).
//
// Inbound (a Twilio inbound-SMS webhook, application/x-www-form-urlencoded):
//   {From:"+1555…", To:"+1444…", Body:"hi", MessageSid:"SM…", AccountSid, …}.
//   Twilio POSTs ONE message per webhook; the caller's webhook buffer parses the form into a
//   plain object and hands it here (a single form object OR an array of them for a batch).
//   From (the sender's E.164 number) IS the conversation key (chatId) — a reply POSTs back to
//   it — and also `from` (the sender, the allowlist key); Body is control-stripped → text;
//   MessageSid → id. SMS is 1:1 → isGroup false. A form with no Body (a status callback, no
//   message text) carries no routable agent text and is SKIPPED.
// Outbound: buildSmsForm(to, from, text) → the form body for POST Messages.json
//   (To=<chatId>&From=<VANTA_TWILIO_FROM>&Body=<text>); the adapter POSTs it via the injected
//   transport keyed by chatId (the sender's number).
// Enable: VANTA_TWILIO_SID + VANTA_TWILIO_TOKEN (the Basic-auth creds) + VANTA_TWILIO_FROM (the
//   Twilio sender number used in the send body). Optional VANTA_SMS_ALLOWLIST = comma list of
//   sender numbers to accept (empty → allow all). The SID/TOKEN are SECRETS: read only into the
//   injected transport at the wire (httpTransport), never a literal in this file.
// Anti-loop: Twilio's inbound webhook delivers received SMS + status callbacks, not the bot's
//   own outbound text echoed back, so there is no self-message to skip on the parse.

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
const SMS_TEXT_LIMIT = 1600;

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

/**
 * The injected SMS transport — the documented live boundary. `poll` pulls new webhook forms (the
 * webhook event source); `push` POSTs one send form to the Twilio Messages API. Both carry the
 * Twilio creds + sender number internally (see `httpTransport` below, the ONLY place the secrets
 * are read). Tests pass a fake transport so no real network — and no secret — is touched.
 */
export type SmsTransport = {
  poll: () => Promise<unknown>;
  push: (body: URLSearchParams) => Promise<void>;
};

export class SmsAdapter implements PlatformAdapter {
  readonly id = "sms";
  private readonly transport: SmsTransport;
  private readonly allow: Set<string>;

  constructor(opts: { transport: SmsTransport; allow?: Set<string> }) {
    this.transport = opts.transport;
    this.allow = opts.allow ?? new Set();
  }

  async connect(): Promise<void> {
    /* stateless REST via the injected transport — nothing to set up */
  }
  async disconnect(): Promise<void> {
    /* nothing to tear down */
  }

  async poll(): Promise<InboundMessage[]> {
    const payload = await this.transport.poll().catch(() => undefined);
    const messages = parseTwilioInbound(payload);
    if (this.allow.size === 0) return messages;
    // Allow a message whose sender number (chatId === from) is listed.
    return messages.filter((m) => this.allow.has(m.chatId));
  }

  async send(msg: OutboundMessage): Promise<void> {
    // SMS is plain text (no markdown), so degrade the agent's markdown to readable plain text,
    // then split to the budget and POST each part keyed by chatId (the sender's number). The
    // configured Twilio sender number is held in the transport (the wire), not on the adapter.
    const formatted = formatForDialect(msg.text, "plain");
    for (const part of splitForLimit(formatted, SMS_TEXT_LIMIT, "chars")) {
      await this.transport.push(buildSmsForm(msg.chatId, "", part)).catch(() => {
        /* errors-as-values: a push failure must not throw through the gateway loop */
      });
    }
  }
}

// Twilio REST API base — the injected transport joins this with the account-scoped path.
const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

/**
 * Build the live Twilio REST transport. THE WIRE: the account SID + auth token (secrets) are read
 * ONLY here, into the `Authorization: Basic <base64(sid:token)>` header — never stored on the
 * adapter and never a literal in this file. `push` POSTs application/x-www-form-urlencoded to
 * /Accounts/<sid>/Messages.json, filling the send body's `From` with the configured sender number
 * (the adapter passes an empty From; the wire owns the sender). Twilio has no inbound poll
 * endpoint (received SMS arrives via the configured webhook), so `poll` is supplied by the
 * caller's webhook buffer in live use; the default here returns no forms. Live use needs a real
 * Twilio account SID + auth token + sender number.
 */
export function httpTransport(sid: string, token: string, from: string, apiBase?: string): SmsTransport {
  const base = (apiBase ?? TWILIO_API_BASE).replace(/\/+$/, "");
  const auth = {
    Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
    "content-type": "application/x-www-form-urlencoded",
  };
  return {
    poll: async () => undefined, // inbound arrives via the configured webhook, not a poll endpoint
    push: async (body) => {
      body.set("From", from); // the wire owns the configured Twilio sender number
      await fetch(`${base}/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: auth,
        body: body.toString(),
        signal: AbortSignal.timeout(5000),
      });
    },
  };
}
