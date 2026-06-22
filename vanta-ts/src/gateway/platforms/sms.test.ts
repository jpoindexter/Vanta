import { describe, it, expect } from "vitest";
import {
  parseTwilioInbound,
  buildSmsForm,
  parseSmsAllowlist,
  smsEnabled,
  stripControl,
  SmsAdapter,
  type SmsTransport,
} from "./sms.js";
import type { OutboundMessage } from "./base.js";

/** A Twilio inbound-SMS webhook form (after the caller parses the urlencoded body to an object). */
function inboundForm(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    From: "+15551230001",
    To: "+15559990000",
    Body: "hi",
    MessageSid: "SM_1",
    AccountSid: "AC_x",
    SmsStatus: "received",
    NumMedia: "0",
    ...over,
  };
}

describe("parseTwilioInbound", () => {
  it("maps a Twilio inbound form to an InboundMessage (chatId=From, from=From, 1:1)", () => {
    expect(parseTwilioInbound(inboundForm())).toEqual([
      { chatId: "+15551230001", from: "+15551230001", text: "hi", id: "SM_1", isGroup: false },
    ]);
  });

  it("accepts a single form object (Twilio POSTs one message per webhook)", () => {
    const out = parseTwilioInbound(inboundForm({ Body: "single", MessageSid: "SM_one" }));
    expect(out.map((m) => m.id)).toEqual(["SM_one"]);
  });

  it("accepts a bare array of forms (a caller's batch)", () => {
    const out = parseTwilioInbound([
      inboundForm({ From: "+1A", Body: "a", MessageSid: "SM_a" }),
      inboundForm({ From: "+1B", Body: "b", MessageSid: "SM_b" }),
    ]);
    expect(out.map((m) => m.id)).toEqual(["SM_a", "SM_b"]);
    expect(out.map((m) => m.chatId)).toEqual(["+1A", "+1B"]);
  });

  it("SKIPS a form with no Body (a status callback carries no agent text)", () => {
    const out = parseTwilioInbound([
      inboundForm({ Body: "keep", MessageSid: "SM_1" }),
      { From: "+15551230001", MessageSid: "SM_2", SmsStatus: "delivered" },
    ]);
    expect(out.map((m) => m.id)).toEqual(["SM_1"]);
  });

  it("SKIPS a form with no From (cannot route a reply)", () => {
    const out = parseTwilioInbound([
      inboundForm({ Body: "keep", MessageSid: "SM_1" }),
      { Body: "orphan", MessageSid: "SM_2" },
    ]);
    expect(out.map((m) => m.id)).toEqual(["SM_1"]);
  });

  it("tolerates a missing MessageSid (id is optional)", () => {
    const out = parseTwilioInbound(inboundForm({ MessageSid: undefined }));
    expect(out).toEqual([
      { chatId: "+15551230001", from: "+15551230001", text: "hi", id: undefined, isGroup: false },
    ]);
  });

  it("control-strips untrusted inbound text (keeping newlines/tabs)", () => {
    const out = parseTwilioInbound(inboundForm({ Body: "a\x1b[31mred\x07\x00b\nline2" }));
    expect(out[0]?.text).toBe("a[31mredb\nline2");
  });

  it("returns [] for garbage (non-object, non-array → empty out)", () => {
    expect(parseTwilioInbound(null)).toEqual([]);
    expect(parseTwilioInbound(undefined)).toEqual([]);
    expect(parseTwilioInbound("not a form")).toEqual([]);
    expect(parseTwilioInbound(42)).toEqual([]);
    expect(parseTwilioInbound({})).toEqual([]);
  });

  it("drops only the malformed elements, keeps the valid ones", () => {
    const out = parseTwilioInbound([
      inboundForm({ From: "+1A", Body: "a", MessageSid: "SM_a" }),
      { junk: true },
      inboundForm({ From: "+1B", Body: "b", MessageSid: "SM_b" }),
    ]);
    expect(out.map((m) => m.id)).toEqual(["SM_a", "SM_b"]);
  });
});

describe("buildSmsForm", () => {
  it("builds a To/From/Body urlencoded form", () => {
    const form = buildSmsForm("+15551230001", "+15559990000", "hello");
    expect(form.get("To")).toBe("+15551230001");
    expect(form.get("From")).toBe("+15559990000");
    expect(form.get("Body")).toBe("hello");
    // urlencodes the form (+ is encoded as %2B in the wire string)
    expect(form.toString()).toBe("To=%2B15551230001&From=%2B15559990000&Body=hello");
  });

  it("control-strips the outbound text (keeping newlines/tabs)", () => {
    const form = buildSmsForm("+1A", "+1B", "a\x00b\x1b\tc\nd");
    expect(form.get("Body")).toBe("ab\tc\nd");
  });

  it("truncates over-1600-char text to the Twilio single-request cap", () => {
    const form = buildSmsForm("+1A", "+1B", "z".repeat(2000));
    expect(form.get("Body")?.length).toBe(1600);
  });
});

describe("parseSmsAllowlist", () => {
  it("parses a comma list of sender numbers", () => {
    expect(
      parseSmsAllowlist({ VANTA_SMS_ALLOWLIST: "+1A, +1B ,+1C" } as NodeJS.ProcessEnv),
    ).toEqual(new Set(["+1A", "+1B", "+1C"]));
  });

  it("empty/absent → empty set (the adapter reads this as allow-all)", () => {
    expect(parseSmsAllowlist({ VANTA_SMS_ALLOWLIST: "" } as NodeJS.ProcessEnv)).toEqual(new Set());
    expect(parseSmsAllowlist({} as NodeJS.ProcessEnv)).toEqual(new Set());
    expect(parseSmsAllowlist({ VANTA_SMS_ALLOWLIST: " , ," } as NodeJS.ProcessEnv)).toEqual(new Set());
  });
});

describe("smsEnabled", () => {
  it("true only when SID + TOKEN + FROM are all present + non-blank", () => {
    expect(
      smsEnabled({
        VANTA_TWILIO_SID: "AC_x",
        VANTA_TWILIO_TOKEN: "tok",
        VANTA_TWILIO_FROM: "+15559990000",
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it("false when any of the three is missing or blank", () => {
    expect(smsEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(
      smsEnabled({ VANTA_TWILIO_SID: "AC_x", VANTA_TWILIO_TOKEN: "tok" } as NodeJS.ProcessEnv),
    ).toBe(false); // no FROM
    expect(
      smsEnabled({
        VANTA_TWILIO_SID: "AC_x",
        VANTA_TWILIO_TOKEN: "tok",
        VANTA_TWILIO_FROM: "  ",
      } as NodeJS.ProcessEnv),
    ).toBe(false); // blank FROM
    expect(
      smsEnabled({
        VANTA_TWILIO_SID: "",
        VANTA_TWILIO_TOKEN: "tok",
        VANTA_TWILIO_FROM: "+1",
      } as NodeJS.ProcessEnv),
    ).toBe(false); // blank SID
  });
});

describe("stripControl", () => {
  it("removes C0/C1 + DEL control chars but keeps \\n and \\t", () => {
    expect(stripControl("a\x00b\x1b\x7f\tc\nd")).toBe("ab\tc\nd");
  });
});

/** An injected fake transport recording pushes; no real network. */
function fakeTransport(pollResult: unknown): {
  transport: SmsTransport;
  pushes: Array<URLSearchParams>;
} {
  const pushes: Array<URLSearchParams> = [];
  const transport: SmsTransport = {
    poll: async () => pollResult,
    push: async (body) => {
      pushes.push(body);
    },
  };
  return { transport, pushes };
}

describe("SmsAdapter (injected transport — no real Twilio API)", () => {
  it("polls via the injected transport and parses inbound messages", async () => {
    const { transport } = fakeTransport(inboundForm({ Body: "ping", MessageSid: "SM_p" }));
    const adapter = new SmsAdapter({ transport });
    expect(adapter.id).toBe("sms");
    const inbound = await adapter.poll();
    expect(inbound).toEqual([
      { chatId: "+15551230001", from: "+15551230001", text: "ping", id: "SM_p", isGroup: false },
    ]);
  });

  it("returns [] (never throws) when the transport poll rejects", async () => {
    const transport: SmsTransport = {
      poll: async () => {
        throw new Error("network down");
      },
      push: async () => {},
    };
    const adapter = new SmsAdapter({ transport });
    await expect(adapter.poll()).resolves.toEqual([]);
  });

  it("filters inbound by the allowlist (sender number)", async () => {
    const { transport } = fakeTransport([
      inboundForm({ From: "+1ok", Body: "ok", MessageSid: "SM_1" }),
      inboundForm({ From: "+1zed", Body: "no", MessageSid: "SM_2" }),
    ]);
    const adapter = new SmsAdapter({ transport, allow: new Set(["+1ok"]) });
    const inbound = await adapter.poll();
    expect(inbound.map((m) => m.id)).toEqual(["SM_1"]);
  });

  it("pushes a To/Body form keyed by chatId (the sender's number)", async () => {
    const { transport, pushes } = fakeTransport([]);
    const adapter = new SmsAdapter({ transport });
    const out: OutboundMessage = { chatId: "+15551230001", text: "reply" };
    await adapter.send(out);
    expect(pushes.length).toBe(1);
    expect(pushes[0]?.get("To")).toBe("+15551230001");
    expect(pushes[0]?.get("Body")).toBe("reply");
  });

  it("splits an over-budget reply into multiple pushes (each a valid send form)", async () => {
    const { transport, pushes } = fakeTransport([]);
    const adapter = new SmsAdapter({ transport });
    await adapter.send({ chatId: "+1grp", text: "z".repeat(3500) });
    expect(pushes.length).toBeGreaterThan(1);
    let total = 0;
    for (const body of pushes) {
      expect(body.get("To")).toBe("+1grp");
      const len = body.get("Body")?.length ?? 0;
      expect(len).toBeLessThanOrEqual(1600);
      total += len;
    }
    expect(total).toBe(3500);
  });

  it("does not throw through the loop when a push rejects (errors-as-values)", async () => {
    const transport: SmsTransport = {
      poll: async () => [],
      push: async () => {
        throw new Error("push failed");
      },
    };
    const adapter = new SmsAdapter({ transport });
    await expect(adapter.send({ chatId: "+1A", text: "reply" })).resolves.toBeUndefined();
  });

  it("connect/disconnect are no-ops (stateless REST)", async () => {
    const { transport } = fakeTransport([]);
    const adapter = new SmsAdapter({ transport });
    await expect(adapter.connect()).resolves.toBeUndefined();
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });
});
