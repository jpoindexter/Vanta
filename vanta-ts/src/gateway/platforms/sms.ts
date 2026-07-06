import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { capabilities, segmentsFor, type AdapterCapabilities } from "./capabilities.js";
import { SMS_TEXT_LIMIT, buildSmsForm, parseTwilioInbound } from "./sms-parse.js";
// MSG-CAPABILITY-DESCRIPTOR — SMS is plain text, char-budgeted, no edit/threads.
const SMS_CAPABILITIES: AdapterCapabilities = capabilities({ charLimit: SMS_TEXT_LIMIT, lenUnit: "chars", markdownDialect: "plain" });

// Re-export the pure parse/build/allowlist/enable helpers so importers keep the same
// module path (`./sms.js`). Their implementation lives in `sms-parse.ts`.
export {
  stripControl,
  parseTwilioInbound,
  buildSmsForm,
  parseSmsAllowlist,
  smsEnabled,
} from "./sms-parse.js";

// SMS adapter — connects Vanta to Twilio's Programmable Messaging (SMS) as a channel,
// on the same PlatformAdapter contract as Telegram/LINE/WhatsApp. The live API (Twilio's
// inbound webhook for received SMS + a Messages.json POST for outbound) is the injected
// boundary: the pure parse/build/allowlist fns (in `sms-parse.ts`) are unit-tested offline;
// the transport ({poll, push}) is supplied by the caller (a real Twilio number live).
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
  readonly capabilities = SMS_CAPABILITIES;
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
    for (const part of segmentsFor(formatted, this.capabilities)) {
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
