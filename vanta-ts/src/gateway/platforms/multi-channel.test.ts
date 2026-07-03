import { describe, it, expect } from "vitest";
import { MultiChannelAdapter, tagRoute, splitRoute } from "./multi-channel.js";
import {
  resolveMessagingAdapters,
  resolveMessagingChannel,
} from "./factory.js";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";

function fakeAdapter(
  id: string,
  inbound: InboundMessage[],
  sent: OutboundMessage[],
  opts: { failPoll?: boolean } = {},
): PlatformAdapter {
  return {
    id,
    connect: async () => {},
    disconnect: async () => {},
    poll: async () => { if (opts.failPoll) throw new Error(`${id} down`); return inbound; },
    send: async (m) => { sent.push(m); },
  };
}

describe("route tagging", () => {
  it("round-trips a tagged chatId", () => {
    expect(splitRoute(tagRoute("slack", "C123"))).toEqual({ platform: "slack", chatId: "C123" });
  });
  it("handles a chatId that itself contains the separator", () => {
    expect(splitRoute(tagRoute("telegram", "a:b:c"))).toEqual({ platform: "telegram", chatId: "a:b:c" });
  });
  it("treats an untagged chatId as platform ''", () => {
    expect(splitRoute("plain")).toEqual({ platform: "", chatId: "plain" });
  });
});

describe("MultiChannelAdapter", () => {
  it("polls every channel and tags each message with its source", async () => {
    const m = new MultiChannelAdapter([
      fakeAdapter("slack", [{ chatId: "C1", text: "a" }], []),
      fakeAdapter("telegram", [{ chatId: "42", text: "b" }], []),
    ]);
    const msgs = await m.poll();
    expect(msgs.map((x) => x.chatId)).toEqual(["slack:C1", "telegram:42"]);
    expect(msgs.map((x) => x.text)).toEqual(["a", "b"]);
  });

  it("survives one channel failing — the others still deliver", async () => {
    const m = new MultiChannelAdapter([
      fakeAdapter("slack", [{ chatId: "C1", text: "a" }], [], { failPoll: true }), // down
      fakeAdapter("telegram", [{ chatId: "42", text: "b" }], []),
    ]);
    const msgs = await m.poll();
    expect(msgs.map((x) => x.chatId)).toEqual(["telegram:42"]); // slack failed, telegram fine
  });

  it("routes a reply back to the channel its tagged chatId names", async () => {
    const slackSent: OutboundMessage[] = [];
    const tgSent: OutboundMessage[] = [];
    const m = new MultiChannelAdapter([
      fakeAdapter("slack", [], slackSent),
      fakeAdapter("telegram", [], tgSent),
    ]);
    await m.send({ chatId: "telegram:42", text: "reply" });
    expect(tgSent).toEqual([{ chatId: "42", text: "reply" }]); // un-tagged for the child
    expect(slackSent).toEqual([]);
  });

  it("drops a reply with an unknown route (never throws)", async () => {
    const m = new MultiChannelAdapter([fakeAdapter("slack", [], [])]);
    await expect(m.send({ chatId: "nope:1", text: "x" })).resolves.toBeUndefined();
  });

  it("exposes its channel ids", () => {
    const m = new MultiChannelAdapter([fakeAdapter("slack", [], []), fakeAdapter("discord", [], [])]);
    expect(m.channelIds()).toEqual(["slack", "discord"]);
  });

  it("reports per-channel health for every channel", () => {
    const m = new MultiChannelAdapter([fakeAdapter("slack", [], []), fakeAdapter("discord", [], [])]);
    expect(m.health().map((h) => ({ id: h.id, status: h.status }))).toEqual([
      { id: "slack", status: "up" },
      { id: "discord", status: "up" },
    ]);
  });

  it("GATEWAY-CHANNEL-SELFHEAL — a flapping channel recovers while the other keeps delivering", async () => {
    // A stateful child that fails poll while `broken`, controlled by the test.
    const flap = { broken: true };
    const flapping: PlatformAdapter = {
      id: "slack",
      connect: async () => {},
      disconnect: async () => {},
      poll: async () => { if (flap.broken) throw new Error("slack down"); return [{ chatId: "C1", text: "healed" }]; },
      send: async () => {},
    };
    let now = 0;
    const m = new MultiChannelAdapter([flapping, fakeAdapter("telegram", [{ chatId: "42", text: "b" }], [])], {
      now: () => now,
    });

    // Tick 1: slack is down, telegram still delivers; slack marked down.
    expect((await m.poll()).map((x) => x.chatId)).toEqual(["telegram:42"]);
    expect(m.health().find((h) => h.id === "slack")?.status).toBe("down");

    // Tick 2: slack recovers, backoff elapsed → both deliver, slack back up.
    flap.broken = false;
    now = 60_000;
    const msgs = await m.poll();
    expect(msgs.map((x) => x.chatId)).toEqual(["slack:C1", "telegram:42"]);
    expect(m.health().find((h) => h.id === "slack")?.status).toBe("up");
  });
});

describe("resolveMessagingChannel — from env", () => {
  const tg = { VANTA_TELEGRAM_TOKEN: "t" };
  const slack = { VANTA_SLACK_BOT_TOKEN: "xoxb" };

  it("returns undefined when nothing is configured", () => {
    expect(resolveMessagingChannel({} as NodeJS.ProcessEnv)).toBeUndefined();
  });
  it("returns the single adapter (no composite) when one channel is configured", () => {
    const ch = resolveMessagingChannel(tg as NodeJS.ProcessEnv);
    expect(ch?.id).toBe("telegram");
  });
  it("returns a MultiChannelAdapter when 2+ channels are configured", () => {
    const ch = resolveMessagingChannel({ ...tg, ...slack } as NodeJS.ProcessEnv);
    expect(ch?.id).toBe("multi");
  });
  it("resolveMessagingAdapters lists every configured channel", () => {
    const all = resolveMessagingAdapters({ ...tg, ...slack } as NodeJS.ProcessEnv);
    expect(all.map((a) => a.id).sort()).toEqual(["slack", "telegram"]);
  });
  it("five named beta channels all resolve together from one env", () => {
    const env = {
      VANTA_TELEGRAM_TOKEN: "t",
      VANTA_SLACK_BOT_TOKEN: "xoxb",
      VANTA_WHATSAPP_TOKEN: "wa",
      VANTA_WHATSAPP_PHONE_ID: "p",
      VANTA_SIGNAL_URL: "http://localhost",
      VANTA_SIGNAL_NUMBER: "+1",
      VANTA_DISCORD_TOKEN: "d",
      VANTA_DISCORD_CHANNEL: "C9",
    } as NodeJS.ProcessEnv;
    const ch = resolveMessagingChannel(env) as MultiChannelAdapter;
    expect(ch.id).toBe("multi");
    expect(ch.channelIds().sort()).toEqual(["discord", "signal", "slack", "telegram", "whatsapp"]);
  });
});
