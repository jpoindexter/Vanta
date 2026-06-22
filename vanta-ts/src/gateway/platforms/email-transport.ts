import type { EmailConfig, EmailTransport, MailHost, OutboundEmail, RawEmail } from "./email.js";

// The live IMAP+SMTP transport for the Email adapter, split out of `email.ts` to keep
// each file under the size gate. The IMAP/SMTP password (a secret) lives only inside the
// `cfg` passed here and is read only at the dynamic-imported client boundary — never
// stored on the adapter, never a literal. `import("imapflow")` / `import("nodemailer")`
// are DYNAMIC and INSIDE the methods, so `email.ts` (and all pure-fn tests) loads even
// when the deps aren't installed; the deps are only needed to actually go live.

// The IMAP "\Seen" flag — adding it marks a fetched message read so the next poll skips it.
const SEEN_FLAG = "\\Seen";

// The subset of an imapflow fetch result we read. Declared locally so the file typechecks
// whether or not `imapflow`'s own types are installed (the dep is dynamic-imported).
type FetchedMessage = {
  uid?: number;
  envelope?: { from?: Array<{ address?: string }>; subject?: string; messageId?: string; date?: Date };
  bodyParts?: Map<string, Buffer>;
};

/**
 * Fetch UNSEEN messages from the IMAP host, map them to `RawEmail`s, and mark them seen
 * (so a later poll doesn't re-deliver them). Errors-as-values: ANY failure (connect,
 * auth, fetch) is swallowed → [].
 */
async function fetchUnseen(cfg: MailHost): Promise<RawEmail[]> {
  try {
    const { ImapFlow } = await import("imapflow");
    const client = new ImapFlow({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      logger: false,
    });
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const fetched: FetchedMessage[] = await client.fetchAll(
        { seen: false },
        { uid: true, envelope: true, bodyParts: ["text"] },
      );
      const out = fetched.map(toRawEmail);
      const uids = fetched.map((m) => m.uid).filter((u): u is number => typeof u === "number");
      if (uids.length > 0) await client.messageFlagsAdd(uids, [SEEN_FLAG], { uid: true });
      return out;
    } finally {
      lock.release();
      await client.logout();
    }
  } catch {
    return []; // errors-as-values: a poll failure must never throw through the gateway loop
  }
}

// Map one imapflow fetch result → RawEmail (the shape `parseEmailMessage` consumes). The
// envelope carries from/subject/messageId/date; the "text" body part carries the body.
function toRawEmail(m: FetchedMessage): RawEmail {
  const env = m.envelope ?? {};
  return {
    from: env.from?.[0]?.address ?? "",
    subject: env.subject ?? "",
    body: m.bodyParts?.get("text")?.toString("utf8") ?? "",
    messageId: env.messageId ?? (m.uid !== undefined ? String(m.uid) : ""),
    date: env.date?.toISOString(),
  };
}

/**
 * Send one reply via the SMTP host. Errors-as-values: any failure is swallowed (the
 * adapter's send already catches, this is defence in depth).
 */
async function sendSmtp(cfg: MailHost, msg: OutboundEmail): Promise<void> {
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
    });
    await transporter.sendMail({ from: cfg.user, to: msg.to, subject: msg.subject, text: msg.body });
  } catch {
    /* errors-as-values: a send failure must not throw through the gateway loop */
  }
}

/** Build the live IMAP+SMTP transport from an `EmailConfig` (built by `build(env)`). */
export function imapSmtpTransport(cfg: EmailConfig): EmailTransport {
  return {
    fetchInbox: () => fetchUnseen(cfg.imap),
    sendMail: (msg) => sendSmtp(cfg.smtp, msg),
  };
}
