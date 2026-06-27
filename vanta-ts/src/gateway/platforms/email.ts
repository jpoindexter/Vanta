import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import {
  buildEmailReply,
  parseEmailMessage,
  RawEmailSchema,
  stripControl,
  type OutboundEmail,
  type RawEmail,
} from "./email-parse.js";

// Email adapter — connects Vanta to a mailbox as a messaging channel, implementing
// the same PlatformAdapter contract as Telegram/Discord so the gateway treats email
// like any other channel. The pure parse/build/allowlist/config fns live in
// `email-parse.ts` (offline-unit-tested) and are re-exported below so the public module
// path (`./email.js`) is unchanged. The live IMAP fetch + SMTP send are the injected
// boundary: the transport ({fetchInbox, sendMail}) is supplied by the caller and the live
// IMAP/SMTP wire lives in `email-transport.ts` (re-exported below).
//
// Enable: VANTA_EMAIL_IMAP + VANTA_EMAIL_SMTP (hosts, optional `:port`) + VANTA_EMAIL_USER
//   + VANTA_EMAIL_PASS all present. Optional VANTA_EMAIL_ALLOWLIST = comma list of sender
//   addresses to accept (empty → allow all). The IMAP/SMTP password is a SECRET: it is only
//   ever read into the live transport (`imapSmtpTransport`, the wire), never a literal here.

// Re-export the pure helpers + data types so importers of `./email.js` see an unchanged
// surface (`email-transport.ts` reads EmailConfig/MailHost/OutboundEmail/RawEmail from here).
export {
  stripControl,
  stripQuotedReply,
  parseEmailMessage,
  buildEmailReply,
  parseEmailAllowlist,
  emailEnabled,
  configured,
  build,
} from "./email-parse.js";
export type { RawEmail, OutboundEmail, MailHost, EmailConfig } from "./email-parse.js";

/**
 * The injected email transport — the documented live boundary. `fetchInbox` pulls new
 * mail (the IMAP poll source); `sendMail` delivers one reply (the SMTP send). Both
 * carry the IMAP/SMTP credentials internally (see `imapSmtpTransport` in
 * `email-transport.ts`, the ONLY place a password would be read). Tests pass a fake
 * transport so no real network — and no secret — is touched.
 */
export type EmailTransport = {
  fetchInbox: () => Promise<RawEmail[]>;
  sendMail: (msg: OutboundEmail) => Promise<void>;
};

// What we keep from a parsed inbound so a later reply can recover the original subject:
// the InboundMessage plus the raw subject (not a field on the shared contract).
type InboundWithSubject = InboundMessage & { subject: string };

export class EmailAdapter implements PlatformAdapter {
  readonly id = "email";
  private readonly transport: EmailTransport;
  private readonly allow: Set<string>;
  // Maps a sender (chatId) → the last subject seen, so send() can build "Re: <orig>"
  // for a reply whose OutboundMessage carries only chatId + text.
  private readonly subjects = new Map<string, string>();

  constructor(opts: { transport: EmailTransport; allow?: Set<string> }) {
    this.transport = opts.transport;
    this.allow = opts.allow ?? new Set();
  }

  async connect(): Promise<void> {
    /* stateful IMAP/SMTP sessions live inside the injected transport — nothing here */
  }
  async disconnect(): Promise<void> {
    /* nothing to tear down — the transport owns its connections */
  }

  async poll(): Promise<InboundMessage[]> {
    const raws = await this.transport.fetchInbox().catch(() => [] as RawEmail[]);
    const messages: InboundWithSubject[] = [];
    for (const raw of raws) {
      const parsed = RawEmailSchema.safeParse(raw);
      if (!parsed.success) continue;
      const inbound = parseEmailMessage(parsed.data);
      this.subjects.set(inbound.chatId, parsed.data.subject);
      messages.push({ ...inbound, subject: parsed.data.subject });
    }
    const visible =
      this.allow.size === 0
        ? messages
        : messages.filter((m) => this.allow.has(m.chatId.toLowerCase()));
    // Strip the internal `subject` carrier before returning the shared-contract shape.
    return visible.map(({ subject, ...rest }) => {
      void subject;
      return rest;
    });
  }

  async send(msg: OutboundMessage): Promise<void> {
    const subject = this.subjects.get(msg.chatId) ?? "";
    const inbound: InboundMessage & { subject: string } = {
      chatId: msg.chatId,
      text: "",
      subject,
    };
    const reply = buildEmailReply(inbound, stripControl(msg.text));
    await this.transport.sendMail(reply).catch(() => {
      /* errors-as-values: a send failure must not throw through the gateway loop */
    });
  }
}

// The live IMAP+SMTP transport (and its dynamic `imapflow`/`nodemailer` imports) lives in
// `email-transport.ts` to keep this file under the size gate. Re-exported so the public
// surface (`import { imapSmtpTransport } from "./email.js"`) is unchanged.
export { imapSmtpTransport } from "./email-transport.js";
