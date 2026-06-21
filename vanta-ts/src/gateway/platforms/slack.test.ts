import { describe, it, expect } from "vitest";
import {
  parseSlackEvents,
  buildSlackPostBody,
  parseSlackAllowlist,
  slackEnabled,
  stripControl,
  SlackAdapter,
  type SlackTransport,
} from "./slack.js";

function envelope(event: Record<string, unknown>): unknown {
  return { type: "event_callback", event: { type: "message", ...event } };
}

describe("parseSlackEvents", () => {
  it("parses a plain user message in a channel", () => {
    const json = envelope({ channel: "C123", user: "U1", text: "hello", ts: "1.2" });
    expect(parseSlackEvents(json)).toEqual([
      { chatId: "C123", from: "U1", text: "hello", id: "1.2", isGroup: true },
    ]);
  });
  it("marks a D channel as a DM (not a group)", () => {
    const json = envelope({ channel: "D999", user: "U1", text: "hi" });
    expect(parseSlackEvents(json)[0]).toMatchObject({ chatId: "D999", isGroup: false });
  });
  it("skips the bot's own messages (bot_id) — anti-loop", () => {
    const json = envelope({ channel: "C1", user: "U1", text: "echo", bot_id: "B1" });
    expect(parseSlackEvents(json)).toEqual([]);
  });
  it("skips subtype events (channel_join, message_changed, bot_message)", () => {
    expect(parseSlackEvents(envelope({ channel: "C1", user: "U1", text: "x", subtype: "channel_join" }))).toEqual([]);
    expect(parseSlackEvents(envelope({ channel: "C1", text: "x", subtype: "bot_message" }))).toEqual([]);
  });
  it("ignores non-event_callback envelopes (url_verification etc.)", () => {
    expect(parseSlackEvents({ type: "url_verification", challenge: "abc" })).toEqual([]);
  });
  it("accepts an array of envelopes", () => {
    const out = parseSlackEvents([
      envelope({ channel: "C1", user: "U1", text: "a" }),
      envelope({ channel: "C2", user: "U2", text: "b" }),
    ]);
    expect(out.map((m) => m.text)).toEqual(["a", "b"]);
  });
  it("control-strips inbound text", () => {
    expect(parseSlackEvents(envelope({ channel: "C1", user: "U1", text: "a\x1bb\x07" }))[0]!.text).toBe("ab");
  });
  it("is tolerant of garbage", () => {
    expect(parseSlackEvents(null)).toEqual([]);
    expect(parseSlackEvents({})).toEqual([]);
  });
});

describe("buildSlackPostBody", () => {
  it("builds {channel, text}", () => {
    expect(buildSlackPostBody("C1", "hi")).toEqual({ channel: "C1", text: "hi" });
  });
  it("control-strips and caps length", () => {
    const body = buildSlackPostBody("C1", "x".repeat(5000) + "\x07");
    expect(body.text.length).toBe(3900);
    expect(body.text).not.toContain("\x07");
  });
});

describe("allowlist + enabled", () => {
  it("parses a comma allowlist; empty → empty set", () => {
    expect([...parseSlackAllowlist({ VANTA_SLACK_ALLOWLIST: "C1, C2" } as NodeJS.ProcessEnv)]).toEqual(["C1", "C2"]);
    expect(parseSlackAllowlist({} as NodeJS.ProcessEnv).size).toBe(0);
  });
  it("is enabled when the bot token is set", () => {
    expect(slackEnabled({ VANTA_SLACK_BOT_TOKEN: "xoxb-1" } as NodeJS.ProcessEnv)).toBe(true);
    expect(slackEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("SlackAdapter", () => {
  const inbound = envelope({ channel: "C1", user: "U1", text: "hey" });
  function fakeTransport(pushed: unknown[]): SlackTransport {
    return { poll: async () => inbound, push: async (b) => { pushed.push(b); } };
  }

  it("polls + parses inbound", async () => {
    const a = new SlackAdapter({ transport: fakeTransport([]) });
    expect((await a.poll())[0]).toMatchObject({ chatId: "C1", text: "hey" });
  });
  it("filters inbound by the channel allowlist", async () => {
    const blocked = new SlackAdapter({ transport: fakeTransport([]), allow: new Set(["C999"]) });
    expect(await blocked.poll()).toHaveLength(0);
    const allowed = new SlackAdapter({ transport: fakeTransport([]), allow: new Set(["C1"]) });
    expect(await allowed.poll()).toHaveLength(1);
  });
  it("sends via chat.postMessage keyed by channel", async () => {
    const pushed: unknown[] = [];
    await new SlackAdapter({ transport: fakeTransport(pushed) }).send({ chatId: "C1", text: "reply" });
    expect(pushed[0]).toEqual({ channel: "C1", text: "reply" });
  });
  it("a poll error degrades to no messages (never throws)", async () => {
    const a = new SlackAdapter({ transport: { poll: async () => { throw new Error("net"); }, push: async () => {} } });
    expect(await a.poll()).toEqual([]);
  });
});

describe("stripControl", () => {
  it("keeps newline + tab", () => {
    expect(stripControl("a\nb\tc\x00")).toBe("a\nb\tc");
  });
});
