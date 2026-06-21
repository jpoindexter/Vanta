import { describe, it, expect } from "vitest";
import {
  parseWhatsappWebhook,
  buildWhatsappSendBody,
  parseWhatsappAllowlist,
  whatsappEnabled,
  stripControl,
  WhatsappAdapter,
  type WhatsappTransport,
} from "./whatsapp.js";

function webhook(messages: unknown[], contacts: unknown[] = []): unknown {
  return { object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages, contacts } }] }] };
}

describe("parseWhatsappWebhook", () => {
  it("parses a text message and maps the contact display name", () => {
    const json = webhook(
      [{ from: "15551234", id: "wamid.1", type: "text", text: { body: "hello" } }],
      [{ profile: { name: "Jason" }, wa_id: "15551234" }],
    );
    expect(parseWhatsappWebhook(json)).toEqual([
      { chatId: "15551234", from: "Jason", text: "hello", id: "wamid.1", isGroup: false },
    ]);
  });
  it("falls back to the wa_id when there is no contact name", () => {
    const json = webhook([{ from: "999", type: "text", text: { body: "hi" } }]);
    expect(parseWhatsappWebhook(json)[0]).toMatchObject({ chatId: "999", from: "999", text: "hi" });
  });
  it("skips status updates (delivery receipts), keeps real messages", () => {
    const json = {
      entry: [
        { changes: [{ value: { statuses: [{ id: "x", status: "delivered" }] } }] },
        { changes: [{ value: { messages: [{ from: "1", type: "text", text: { body: "real" } }] } }] },
      ],
    };
    const out = parseWhatsappWebhook(json);
    expect(out).toHaveLength(1);
    expect(out[0]!.text).toBe("real");
  });
  it("control-strips inbound text (escape-injection defense)", () => {
    const json = webhook([{ from: "1", type: "text", text: { body: "a\x1b[31mb\x07c" } }]);
    expect(parseWhatsappWebhook(json)[0]!.text).toBe("a[31mbc");
  });
  it("is tolerant of garbage payloads", () => {
    expect(parseWhatsappWebhook(null)).toEqual([]);
    expect(parseWhatsappWebhook({ entry: "nope" })).toEqual([]);
    expect(parseWhatsappWebhook({})).toEqual([]);
  });
});

describe("parseWhatsappWebhook — media (MSG-MEDIA-IMAGES)", () => {
  it("extracts an inbound image with its caption + mime + media ref", () => {
    const json = webhook([
      { from: "1", id: "m1", type: "image", image: { id: "media-9", mime_type: "image/png", caption: "look" } },
    ]);
    const out = parseWhatsappWebhook(json);
    expect(out[0]).toMatchObject({ chatId: "1", text: "look" });
    expect(out[0]!.media).toEqual([{ kind: "image", mime: "image/png", url: "wa-media:media-9" }]);
  });
  it("extracts an inbound voice memo as audio media (empty text)", () => {
    const json = webhook([{ from: "1", type: "audio", audio: { id: "v3", mime_type: "audio/ogg" } }]);
    const out = parseWhatsappWebhook(json);
    expect(out[0]!.text).toBe("");
    expect(out[0]!.media).toEqual([{ kind: "audio", mime: "audio/ogg", url: "wa-media:v3" }]);
  });
  it("defaults the mime when the platform omits it", () => {
    const json = webhook([{ from: "1", type: "image", image: { id: "x" } }]);
    expect(parseWhatsappWebhook(json)[0]!.media![0]!.mime).toBe("image/jpeg");
  });
});

describe("buildWhatsappSendBody", () => {
  it("builds the Cloud API text body", () => {
    expect(buildWhatsappSendBody("15551234", "hi")).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "15551234",
      type: "text",
      text: { body: "hi" },
    });
  });
  it("control-strips and caps the body length", () => {
    const body = buildWhatsappSendBody("1", "x".repeat(5000) + "\x07");
    expect(body.text.body.length).toBe(4096);
    expect(body.text.body).not.toContain("\x07");
  });
});

describe("allowlist + enabled", () => {
  it("parses a comma allowlist; empty → empty set", () => {
    expect([...parseWhatsappAllowlist({ VANTA_WHATSAPP_ALLOWLIST: "1, 2 ,3" } as NodeJS.ProcessEnv)]).toEqual(["1", "2", "3"]);
    expect(parseWhatsappAllowlist({} as NodeJS.ProcessEnv).size).toBe(0);
  });
  it("is enabled only when BOTH token and phone id are set", () => {
    expect(whatsappEnabled({ VANTA_WHATSAPP_TOKEN: "t", VANTA_WHATSAPP_PHONE_ID: "p" } as NodeJS.ProcessEnv)).toBe(true);
    expect(whatsappEnabled({ VANTA_WHATSAPP_TOKEN: "t" } as NodeJS.ProcessEnv)).toBe(false);
    expect(whatsappEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("WhatsappAdapter", () => {
  const inbound = webhook([{ from: "111", type: "text", text: { body: "hey" } }]);

  function fakeTransport(pushed: unknown[]): WhatsappTransport {
    return { poll: async () => inbound, push: async (b) => { pushed.push(b); } };
  }

  it("polls + parses inbound", async () => {
    const a = new WhatsappAdapter({ transport: fakeTransport([]) });
    const msgs = await a.poll();
    expect(msgs[0]).toMatchObject({ chatId: "111", text: "hey" });
  });
  it("filters inbound by the wa_id allowlist", async () => {
    const allowed = new WhatsappAdapter({ transport: fakeTransport([]), allow: new Set(["111"]) });
    expect(await allowed.poll()).toHaveLength(1);
    const blocked = new WhatsappAdapter({ transport: fakeTransport([]), allow: new Set(["999"]) });
    expect(await blocked.poll()).toHaveLength(0);
  });
  it("sends via the transport keyed by chatId", async () => {
    const pushed: unknown[] = [];
    const a = new WhatsappAdapter({ transport: fakeTransport(pushed) });
    await a.send({ chatId: "111", text: "reply" });
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({ to: "111", text: { body: "reply" } });
  });
  it("a poll-transport error degrades to no messages (never throws)", async () => {
    const a = new WhatsappAdapter({ transport: { poll: async () => { throw new Error("net"); }, push: async () => {} } });
    expect(await a.poll()).toEqual([]);
  });
});

describe("stripControl", () => {
  it("keeps newline + tab, drops other control chars", () => {
    expect(stripControl("a\nb\tc\x00\x1b")).toBe("a\nb\tc");
  });
});
