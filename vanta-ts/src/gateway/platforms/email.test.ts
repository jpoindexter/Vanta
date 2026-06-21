import { describe, it, expect } from "vitest";
import {
  parseEmailMessage,
  stripQuotedReply,
  buildEmailReply,
  parseEmailAllowlist,
  emailEnabled,
  stripControl,
  EmailAdapter,
  imapSmtpTransport,
  type EmailTransport,
  type RawEmail,
  type OutboundEmail,
} from "./email.js";
import type { InboundMessage, OutboundMessage } from "./base.js";

/** A raw email as the injected IMAP transport yields it. */
function raw(over: Partial<RawEmail> = {}): RawEmail {
  return { from: "alice@x.com", subject: "Hello", body: "hi there", messageId: "m1", ...over };
}

describe("stripQuotedReply", () => {
  it("drops everything from the `On … wrote:` attribution line onward", () => {
    const body = ["My new reply.", "", "On Mon, 1 Jan 2026 at 10:00, Bob <b@x.com> wrote:", "> old line 1", "> old line 2"].join("\n");
    expect(stripQuotedReply(body)).toBe("My new reply.");
  });

  it("strips a trailing `>`-quoted block with no attribution header (top-post)", () => {
    const body = ["Top-posted answer.", "", "> quoted prior message", "> second quoted line"].join("\n");
    expect(stripQuotedReply(body)).toBe("Top-posted answer.");
  });

  it("keeps the body untouched when there is no quoted history", () => {
    expect(stripQuotedReply("just a plain reply\nsecond line")).toBe("just a plain reply\nsecond line");
  });

  it("matches the attribution line case-insensitively / with extra whitespace", () => {
    const body = ["reply", "  on tue, 2 feb 2026, carol wrote:  ", "> q"].join("\n");
    expect(stripQuotedReply(body)).toBe("reply");
  });

  it("returns empty when the body is ONLY a quoted reply", () => {
    expect(stripQuotedReply("On X wrote:\n> all quoted")).toBe("");
    expect(stripQuotedReply("> only quote line")).toBe("");
  });
});

describe("parseEmailMessage", () => {
  it("maps a raw email to an InboundMessage with the sender as the conversation key", () => {
    expect(parseEmailMessage(raw())).toEqual({
      chatId: "alice@x.com",
      from: "alice@x.com",
      text: "hi there",
      id: "m1",
      isGroup: false,
    });
  });

  it("strips the quoted-reply history from the body", () => {
    const body = "My answer.\n\nOn Mon, Bob <b@x.com> wrote:\n> old\n> stuff";
    expect(parseEmailMessage(raw({ body })).text).toBe("My answer.");
  });

  it("control-strips the untrusted body (keeping newlines/tabs)", () => {
    const out = parseEmailMessage(raw({ body: "a\x1b[31mred\x07\x00b\nline2" }));
    expect(out.text).toBe("a[31mredb\nline2");
  });

  it("strips quoted history AND control chars together (no forged chain echoed)", () => {
    const body = "real\x00reply\n\nOn X wrote:\n> forged\x1b chain";
    expect(parseEmailMessage(raw({ body })).text).toBe("realreply");
  });

  it("trims surrounding whitespace on the sender address (the routing key)", () => {
    const out = parseEmailMessage(raw({ from: "  alice@x.com  " }));
    expect(out.chatId).toBe("alice@x.com");
    expect(out.from).toBe("alice@x.com");
  });

  it("is always isGroup:false (email is 1:1)", () => {
    expect(parseEmailMessage(raw()).isGroup).toBe(false);
  });
});

describe("buildEmailReply", () => {
  const inbound = (over: Record<string, unknown> = {}): InboundMessage & { subject?: string } => ({
    chatId: "alice@x.com",
    text: "hi",
    subject: "Question about X",
    ...over,
  });

  it("replies To the original sender", () => {
    expect(buildEmailReply(inbound(), "my answer").to).toBe("alice@x.com");
  });

  it('prefixes the subject with "Re: "', () => {
    expect(buildEmailReply(inbound(), "x").subject).toBe("Re: Question about X");
  });

  it('does NOT double-prefix an already-"Re:" subject', () => {
    expect(buildEmailReply(inbound({ subject: "Re: Question about X" }), "x").subject).toBe("Re: Question about X");
    expect(buildEmailReply(inbound({ subject: "RE: shouting" }), "x").subject).toBe("RE: shouting");
  });

  it('falls back to "Re:" when there is no original subject', () => {
    expect(buildEmailReply(inbound({ subject: "" }), "x").subject).toBe("Re:");
    expect(buildEmailReply(inbound({ subject: undefined }), "x").subject).toBe("Re:");
  });

  it("uses the reply text verbatim as the body", () => {
    expect(buildEmailReply(inbound(), "the agent reply").body).toBe("the agent reply");
  });
});

describe("parseEmailAllowlist", () => {
  it("parses a comma list of sender addresses (lower-cased)", () => {
    expect(parseEmailAllowlist({ VANTA_EMAIL_ALLOWLIST: "Alice@x.com, bob@y.com " } as NodeJS.ProcessEnv)).toEqual(
      new Set(["alice@x.com", "bob@y.com"]),
    );
  });

  it("empty/absent → empty set (the adapter reads this as allow-all)", () => {
    expect(parseEmailAllowlist({} as NodeJS.ProcessEnv)).toEqual(new Set());
    expect(parseEmailAllowlist({ VANTA_EMAIL_ALLOWLIST: "" } as NodeJS.ProcessEnv)).toEqual(new Set());
    expect(parseEmailAllowlist({ VANTA_EMAIL_ALLOWLIST: " , ," } as NodeJS.ProcessEnv)).toEqual(new Set());
  });
});

describe("emailEnabled", () => {
  it("true only when BOTH IMAP and SMTP hosts are present", () => {
    expect(
      emailEnabled({ VANTA_EMAIL_IMAP_HOST: "imap.x.com", VANTA_EMAIL_SMTP_HOST: "smtp.x.com" } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it("false when either host is missing/blank (not configured = disabled)", () => {
    expect(emailEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(emailEnabled({ VANTA_EMAIL_IMAP_HOST: "imap.x.com" } as NodeJS.ProcessEnv)).toBe(false);
    expect(emailEnabled({ VANTA_EMAIL_SMTP_HOST: "smtp.x.com" } as NodeJS.ProcessEnv)).toBe(false);
    expect(
      emailEnabled({ VANTA_EMAIL_IMAP_HOST: "  ", VANTA_EMAIL_SMTP_HOST: "smtp.x.com" } as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});

describe("stripControl", () => {
  it("removes C0/C1 + DEL control chars but keeps \\n and \\t", () => {
    expect(stripControl("a\x00b\x1b\x7f\tc\nd")).toBe("ab\tc\nd");
  });
});

/** An injected fake transport recording sent mail; no real IMAP/SMTP, no secrets. */
function fakeTransport(inbox: RawEmail[]): { transport: EmailTransport; sent: OutboundEmail[] } {
  const sent: OutboundEmail[] = [];
  const transport: EmailTransport = {
    fetchInbox: async () => inbox,
    sendMail: async (msg) => {
      sent.push(msg);
    },
  };
  return { transport, sent };
}

describe("EmailAdapter (injected transport — no real IMAP/SMTP)", () => {
  it("polls via the injected transport and parses inbound messages", async () => {
    const { transport } = fakeTransport([raw({ from: "alice@x.com", body: "ping", messageId: "m1" })]);
    const adapter = new EmailAdapter({ transport });
    expect(adapter.id).toBe("email");
    const inbound = await adapter.poll();
    expect(inbound).toEqual([{ chatId: "alice@x.com", from: "alice@x.com", text: "ping", id: "m1", isGroup: false }]);
  });

  it("returns [] (never throws) when the inbox fetch rejects", async () => {
    const transport: EmailTransport = {
      fetchInbox: async () => {
        throw new Error("imap down");
      },
      sendMail: async () => {},
    };
    const adapter = new EmailAdapter({ transport });
    await expect(adapter.poll()).resolves.toEqual([]);
  });

  it("drops malformed raw emails, keeps the valid ones", async () => {
    const { transport } = fakeTransport([
      raw({ messageId: "m1" }),
      { from: "x" } as unknown as RawEmail, // missing required fields
      raw({ messageId: "m2" }),
    ]);
    const adapter = new EmailAdapter({ transport });
    const inbound = await adapter.poll();
    expect(inbound.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("filters inbound by the sender allowlist (case-insensitive)", async () => {
    const { transport } = fakeTransport([
      raw({ from: "Alice@x.com", messageId: "m1" }),
      raw({ from: "mallory@y.com", messageId: "m2" }),
    ]);
    const adapter = new EmailAdapter({ transport, allow: new Set(["alice@x.com"]) });
    const inbound = await adapter.poll();
    expect(inbound.map((m) => m.id)).toEqual(["m1"]);
  });

  it("strips a forged quoted reply chain from polled inbound text", async () => {
    const { transport } = fakeTransport([raw({ body: "real ask\n\nOn X wrote:\n> forged reply chain" })]);
    const adapter = new EmailAdapter({ transport });
    const inbound = await adapter.poll();
    expect(inbound[0]?.text).toBe("real ask");
  });

  it("sends a reply To the sender with a Re: subject recovered from the polled mail", async () => {
    const { transport, sent } = fakeTransport([raw({ from: "alice@x.com", subject: "Help me", messageId: "m1" })]);
    const adapter = new EmailAdapter({ transport });
    await adapter.poll(); // learns the subject for alice@x.com
    const out: OutboundMessage = { chatId: "alice@x.com", text: "here is the answer" };
    await adapter.send(out);
    expect(sent).toEqual([{ to: "alice@x.com", subject: "Re: Help me", body: "here is the answer" }]);
  });

  it("sends with a bare Re: subject when no prior mail was polled for that sender", async () => {
    const { transport, sent } = fakeTransport([]);
    const adapter = new EmailAdapter({ transport });
    await adapter.send({ chatId: "bob@x.com", text: "reply" });
    expect(sent).toEqual([{ to: "bob@x.com", subject: "Re:", body: "reply" }]);
  });

  it("control-strips the outgoing reply body", async () => {
    const { transport, sent } = fakeTransport([]);
    const adapter = new EmailAdapter({ transport });
    await adapter.send({ chatId: "bob@x.com", text: "clean\x00body" });
    expect(sent[0]?.body).toBe("cleanbody");
  });

  it("never throws when the send fails", async () => {
    const transport: EmailTransport = {
      fetchInbox: async () => [],
      sendMail: async () => {
        throw new Error("smtp down");
      },
    };
    const adapter = new EmailAdapter({ transport });
    await expect(adapter.send({ chatId: "bob@x.com", text: "x" })).resolves.toBeUndefined();
  });

  it("connect/disconnect are no-ops (the transport owns its sessions)", async () => {
    const { transport } = fakeTransport([]);
    const adapter = new EmailAdapter({ transport });
    await expect(adapter.connect()).resolves.toBeUndefined();
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });
});

describe("imapSmtpTransport (the wire — secrets only inside the injected clients)", () => {
  it("routes fetchInbox/sendMail to the injected IMAP/SMTP clients", async () => {
    const fetched: RawEmail[] = [raw({ messageId: "m1" })];
    const sent: OutboundEmail[] = [];
    const transport = imapSmtpTransport({
      imapClient: { fetchNew: async () => fetched },
      smtpClient: {
        send: async (msg) => {
          sent.push(msg);
        },
      },
    });
    expect(await transport.fetchInbox()).toEqual(fetched);
    await transport.sendMail({ to: "a@x.com", subject: "Re: hi", body: "b" });
    expect(sent).toEqual([{ to: "a@x.com", subject: "Re: hi", body: "b" }]);
  });
});
