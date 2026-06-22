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
// Enable: VANTA_EMAIL_IMAP + VANTA_EMAIL_SMTP (hosts, optional `:port`) + VANTA_EMAIL_USER
//   + VANTA_EMAIL_PASS all present. Optional VANTA_EMAIL_ALLOWLIST = comma list of sender
//   addresses to accept (empty → allow all). The IMAP/SMTP password is a SECRET: it is only
//   ever read into the live transport (`imapSmtpTransport`, the wire below), never a literal
//   in this file. The live transport dynamic-imports `imapflow` (IMAP receive) + `nodemailer`
//   (SMTP send) INSIDE its methods, so this module + all pure-fn tests load without the deps.

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

// The four env keys the live transport needs: an IMAP host (inbound), an SMTP host
// (outbound), and the shared mailbox user + password. A host accepts an optional
// `:port` suffix (e.g. "imap.x.com:993"); the password is a SECRET, read only inside
// `imapSmtpTransport` (never logged, never stored on the adapter).
const ENV_IMAP = "VANTA_EMAIL_IMAP";
const ENV_SMTP = "VANTA_EMAIL_SMTP";
const ENV_USER = "VANTA_EMAIL_USER";
const ENV_PASS = "VANTA_EMAIL_PASS";

/**
 * Email is enabled only when ALL FOUR live-transport env vars are present (non-blank):
 * the IMAP host (inbound), the SMTP host (outbound), and the mailbox user + password.
 * A one-way or unauthenticated mailbox isn't a usable messaging channel. Pure — and the
 * same gate `configured(env)` uses, so "enabled" and "buildable" never disagree.
 */
export function emailEnabled(env: NodeJS.ProcessEnv): boolean {
  return [ENV_IMAP, ENV_SMTP, ENV_USER, ENV_PASS].every((k) => Boolean(env[k]?.trim()));
}

// `configured` is the build(env) gate: it's exactly `emailEnabled` (all four keys
// present), named at the wire so the call site reads as "is the transport configured?".
export const configured = emailEnabled;

// Defaults for the standard implicit-TLS ports when a host carries no `:port` suffix:
// IMAPS 993, SMTPS 465. Both use secure (TLS-from-connect) sockets by default.
const DEFAULT_IMAP_PORT = 993;
const DEFAULT_SMTP_PORT = 465;

/** One end's connection params — host/port/secure plus the shared mailbox credentials. */
export type MailHost = { host: string; port: number; secure: boolean; user: string; pass: string };

/** The IMAP+SMTP connection config the live transport dials. Built from env by `build`. */
export type EmailConfig = { imap: MailHost; smtp: MailHost };

// Split a "host" or "host:port" value into {host, port}, falling back to the default port
// when no numeric suffix is present. Pure.
function splitHostPort(value: string, defaultPort: number): { host: string; port: number } {
  const at = value.lastIndexOf(":");
  if (at > 0) {
    const port = Number(value.slice(at + 1));
    if (Number.isInteger(port) && port > 0) return { host: value.slice(0, at).trim(), port };
  }
  return { host: value.trim(), port: defaultPort };
}

/**
 * Build the live `EmailConfig` from the four env vars (the host values may carry an
 * optional `:port`; the password is the secret). Call only when `configured(env)` is
 * true — it reads the raw values (blank when absent). Pure (a plain projection of env).
 */
export function build(env: NodeJS.ProcessEnv): EmailConfig {
  const user = (env[ENV_USER] ?? "").trim();
  const pass = env[ENV_PASS] ?? "";
  const imap = splitHostPort(env[ENV_IMAP] ?? "", DEFAULT_IMAP_PORT);
  const smtp = splitHostPort(env[ENV_SMTP] ?? "", DEFAULT_SMTP_PORT);
  return {
    imap: { ...imap, secure: imap.port !== 587, user, pass },
    smtp: { ...smtp, secure: smtp.port !== 587, user, pass },
  };
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

// The live IMAP+SMTP transport (and its dynamic `imapflow`/`nodemailer` imports) lives in
// `email-transport.ts` to keep this file under the size gate. Re-exported so the public
// surface (`import { imapSmtpTransport } from "./email.js"`) is unchanged.
export { imapSmtpTransport } from "./email-transport.js";
