import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";

// Email adapter — connects Vanta to a mailbox as a messaging channel, implementing
// the same PlatformAdapter contract as Telegram/Discord so the gateway treats email
// like any other channel. The live IMAP fetch + SMTP send are the injected boundary:
// the pure parse/build/allowlist fns are unit-tested offline; the transport
// ({fetchInbox, sendMail}) is supplied by the caller (real IMAP/SMTP live).
//
// Inbound shape (a RawEmail: {from, subject, body, messageId, date?}):
//   parse → InboundMessage. The sender address IS the conversation key (chatId), so a
//   reply threads back to the same person. The body has its QUOTED-REPLY HISTORY
//   STRIPPED (an `On … wrote:` attribution + any trailing `>`-quoted block) and is
//   then control-stripped — inbound mail is untrusted, and a forged reply chain must
//   not be echoed back into the agent turn.
// Outbound: buildEmailReply(inbound, text) → {to, subject:"Re: <orig>", body}. To = the
//   sender; the subject is "Re:"-prefixed exactly once (no "Re: Re:" pile-up).
// Enable: VANTA_EMAIL_IMAP_HOST AND VANTA_EMAIL_SMTP_HOST present. Optional
//   VANTA_EMAIL_ALLOWLIST = comma list of sender addresses to accept (empty → allow
//   all). The IMAP/SMTP passwords are SECRETS: they are only ever read into the
//   injected transport (named at the wire below), never a literal in this file.

// Strip C0/C1 control chars (incl. ESC, DEL) from untrusted inbound text, but KEEP
// newline (\x0a) and tab (\x09) — both are legitimate in an email body and the agent
// input is multi-line. Defends against escape/control injection from a remote sender
// before the text reaches the agent.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

/** Strip control chars (keeping \n and \t) from untrusted inbound text. Pure. */
export function stripControl(text: string): string {
  return text.replace(CONTROL_CHARS, "");
}

// A reply-attribution line, e.g. "On Mon, 1 Jan 2026 at 10:00, Alice <a@x.com> wrote:".
// Everything from this line onward is the quoted history of the prior message, not the
// new reply text. Tolerant: matches the common "On … wrote:" form (any whitespace/case).
const ATTRIBUTION_LINE = /^\s*On\b.*\bwrote:\s*$/i;

/**
 * Strip an email's quoted-reply history, keeping only the new reply text. Drops
 * everything from the first `On … wrote:` attribution line onward, then trims any
 * trailing block of leading-`>` quote lines (a top-posted reply with no attribution).
 * Blank lines immediately before the cut are trimmed so the kept text ends cleanly.
 * Pure.
 */
export function stripQuotedReply(body: string): string {
  const lines = body.split("\n");
  // Cut at the first attribution line — the rest is the quoted prior message.
  const attrIdx = lines.findIndex((line) => ATTRIBUTION_LINE.test(line));
  let kept = attrIdx === -1 ? lines : lines.slice(0, attrIdx);
  // Drop a trailing block of `>`-quoted lines (quote with no attribution header).
  let end = kept.length;
  while (end > 0 && /^\s*>/.test(kept[end - 1] ?? "")) end--;
  kept = kept.slice(0, end);
  // Trim trailing blank lines left behind by the cut.
  while (kept.length > 0 && (kept[kept.length - 1] ?? "").trim() === "") kept.pop();
  return kept.join("\n");
}

// One raw email as the injected IMAP transport yields it. Tolerant: only the fields we
// route on are required (unknown extras ignored); `date` is optional metadata.
const RawEmailSchema = z.object({
  from: z.string(),
  subject: z.string(),
  body: z.string(),
  messageId: z.string(),
  date: z.string().optional(),
});

export type RawEmail = z.infer<typeof RawEmailSchema>;

/**
 * Parse a raw email into an InboundMessage on the shared contract
 * (`gateway/platforms/base.ts`, off-limits this round). The sender address → chatId
 * (the conversation/routing key AND the allowlist key) and `from`; messageId → id; the
 * body has its quoted-reply history stripped, then is control-stripped, → text. Email
 * is 1:1, so isGroup is false. Pure.
 */
export function parseEmailMessage(raw: RawEmail): InboundMessage {
  const sender = raw.from.trim();
  return {
    chatId: sender,
    from: sender,
    text: stripControl(stripQuotedReply(raw.body)),
    id: raw.messageId,
    isGroup: false,
  };
}

/**
 * Build the reply for an inbound email: to = the original sender (the conversation
 * key), subject = "Re: <orig>" prefixed exactly once (an existing "Re:" is not
 * doubled), body = the agent's reply text verbatim. Pure.
 */
export function buildEmailReply(
  inbound: InboundMessage & { subject?: string },
  replyText: string,
): { to: string; subject: string; body: string } {
  return {
    to: inbound.chatId,
    subject: reSubject(inbound),
    body: replyText,
  };
}

// "Re:"-prefix the original subject exactly once. The original subject is carried on
// the inbound's `subject` field when present (set by the adapter from the RawEmail);
// an already-"Re:"-prefixed subject is returned unchanged (no "Re: Re:").
function reSubject(inbound: InboundMessage & { subject?: string }): string {
  const orig = (inbound.subject ?? "").trim();
  if (/^re:/i.test(orig)) return orig;
  return orig ? `Re: ${orig}` : "Re:";
}

/**
 * Parse the VANTA_EMAIL_ALLOWLIST sender-address allowlist (comma list). Empty/absent
 * → an empty set, which the adapter treats as "allow all". Addresses are lower-cased
 * so the match is case-insensitive (email addresses are case-insensitive in practice).
 * Pure.
 */
export function parseEmailAllowlist(env: NodeJS.ProcessEnv): Set<string> {
  const raw = env.VANTA_EMAIL_ALLOWLIST ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Email is enabled only when BOTH an IMAP host (inbound) and an SMTP host (outbound)
 * are configured — a one-way mailbox isn't a messaging channel. Pure.
 */
export function emailEnabled(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.VANTA_EMAIL_IMAP_HOST &&
      env.VANTA_EMAIL_IMAP_HOST.trim() &&
      env.VANTA_EMAIL_SMTP_HOST &&
      env.VANTA_EMAIL_SMTP_HOST.trim(),
  );
}

// The message the SMTP transport sends — the built reply addressed to the recipient.
export type OutboundEmail = { to: string; subject: string; body: string };

/**
 * The injected email transport — the documented live boundary. `fetchInbox` pulls new
 * mail (the IMAP poll source); `sendMail` delivers one reply (the SMTP send). Both
 * carry the IMAP/SMTP credentials internally (see `imapSmtpTransport` below, the ONLY
 * place a password would be read). Tests pass a fake transport so no real network — and
 * no secret — is touched.
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

/**
 * Build the live IMAP+SMTP transport. THE WIRE: the IMAP/SMTP passwords (secrets) are
 * read ONLY here, into the injected mail client — never stored on the adapter and never
 * a literal in this file. Live use needs a real `imapClient` (new-mail fetch) and
 * `smtpClient` (send), each constructed by the caller with its own credentials from the
 * environment. The clients are injected so this module stays dependency-free and
 * offline-testable; constructing the real ones is the caller's documented boundary.
 */
export function imapSmtpTransport(clients: {
  imapClient: { fetchNew: () => Promise<RawEmail[]> };
  smtpClient: { send: (msg: OutboundEmail) => Promise<void> };
}): EmailTransport {
  return {
    fetchInbox: () => clients.imapClient.fetchNew(),
    sendMail: (msg) => clients.smtpClient.send(msg),
  };
}
