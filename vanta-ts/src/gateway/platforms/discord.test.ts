import { describe, it, expect } from "vitest";
import {
  parseDiscordMessages,
  buildDiscordSendBody,
  parseDiscordAllowlist,
  discordEnabled,
  stripControl,
  DiscordAdapter,
  type DiscordTransport,
} from "./discord.js";
import type { OutboundMessage } from "./base.js";

/** A Discord message object as it arrives from the REST/gateway payload. */
function msg(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: "1", channel_id: "c1", content: "hi", author: { id: "u1", bot: false }, ...over };
}

describe("parseDiscordMessages", () => {
  it("maps a Discord message to an InboundMessage on the shared contract", () => {
    expect(parseDiscordMessages([msg()])).toEqual([
      { chatId: "c1", from: "u1", text: "hi", id: "1", isGroup: true },
    ]);
  });

  it("SKIPS bot-authored messages (anti-loop — never replies to itself/another bot)", () => {
    const out = parseDiscordMessages([
      msg({ id: "1", content: "from human", author: { id: "u1", bot: false } }),
      msg({ id: "2", content: "from bot", author: { id: "b9", bot: true } }),
    ]);
    expect(out).toEqual([{ chatId: "c1", from: "u1", text: "from human", id: "1", isGroup: true }]);
  });

  it("treats a missing author.bot as a real (non-bot) user", () => {
    const out = parseDiscordMessages([msg({ author: { id: "u1" } })]);
    expect(out).toHaveLength(1);
    expect(out[0]?.from).toBe("u1");
  });

  it("control-strips untrusted inbound text (keeping newlines/tabs)", () => {
    const out = parseDiscordMessages([msg({ content: "a\x1b[31mred\x07\x00b\nline2" })]);
    expect(out[0]?.text).toBe("a[31mredb\nline2");
  });

  it("returns [] for a non-array (garbage in → empty out)", () => {
    expect(parseDiscordMessages(null)).toEqual([]);
    expect(parseDiscordMessages(undefined)).toEqual([]);
    expect(parseDiscordMessages({})).toEqual([]);
    expect(parseDiscordMessages("not json")).toEqual([]);
  });

  it("drops only the malformed elements, keeps the valid ones", () => {
    const out = parseDiscordMessages([msg({ id: "1" }), { junk: true }, msg({ id: "2" })]);
    expect(out.map((m) => m.id)).toEqual(["1", "2"]);
  });
});

describe("buildDiscordSendBody", () => {
  it("wraps text in a {content} REST body", () => {
    expect(buildDiscordSendBody("hello")).toEqual({ content: "hello" });
  });

  it("truncates content over Discord's 2000-char limit", () => {
    const long = "x".repeat(2500);
    const body = buildDiscordSendBody(long);
    expect(body.content).toHaveLength(2000);
    expect(body.content).toBe("x".repeat(2000));
  });

  it("leaves text at/under 2000 chars untouched", () => {
    const exact = "y".repeat(2000);
    expect(buildDiscordSendBody(exact).content).toBe(exact);
  });
});

describe("parseDiscordAllowlist", () => {
  it("parses a comma list of channel/user ids", () => {
    expect(parseDiscordAllowlist("c1, u2 ,c3")).toEqual(new Set(["c1", "u2", "c3"]));
  });

  it("empty/absent → empty set (the adapter reads this as allow-all)", () => {
    expect(parseDiscordAllowlist("")).toEqual(new Set());
    expect(parseDiscordAllowlist(undefined)).toEqual(new Set());
    expect(parseDiscordAllowlist(" , ,")).toEqual(new Set());
  });
});

describe("discordEnabled", () => {
  it("true only when VANTA_DISCORD_TOKEN is present + non-blank", () => {
    expect(discordEnabled({ VANTA_DISCORD_TOKEN: "tok" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("false when the token is absent or blank (not configured = disabled)", () => {
    expect(discordEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(discordEnabled({ VANTA_DISCORD_TOKEN: "  " } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("stripControl", () => {
  it("removes C0/C1 + DEL control chars but keeps \\n and \\t", () => {
    expect(stripControl("a\x00b\x1b\x7f\tc\nd")).toBe("ab\tc\nd");
  });
});

/** An injected fake transport recording posts; no real network. */
function fakeTransport(poll: unknown): { transport: DiscordTransport; posts: Array<{ path: string; body: unknown }> } {
  const posts: Array<{ path: string; body: unknown }> = [];
  const transport: DiscordTransport = {
    fetchJson: async () => poll,
    postJson: async (path, body) => {
      posts.push({ path, body });
    },
  };
  return { transport, posts };
}

describe("DiscordAdapter (injected transport — no real Discord API)", () => {
  it("polls via the injected transport and parses inbound messages", async () => {
    const { transport } = fakeTransport([msg({ content: "ping" })]);
    const adapter = new DiscordAdapter({ transport, channelId: "c1" });
    expect(adapter.id).toBe("discord");
    const inbound = await adapter.poll();
    expect(inbound).toEqual([{ chatId: "c1", from: "u1", text: "ping", id: "1", isGroup: true }]);
  });

  it("returns [] (never throws) when the transport fetch rejects", async () => {
    const transport: DiscordTransport = {
      fetchJson: async () => {
        throw new Error("network down");
      },
      postJson: async () => {},
    };
    const adapter = new DiscordAdapter({ transport, channelId: "c1" });
    await expect(adapter.poll()).resolves.toEqual([]);
  });

  it("filters inbound by the allowlist (channel OR author id)", async () => {
    const { transport } = fakeTransport([
      msg({ id: "1", channel_id: "c1", author: { id: "u1", bot: false } }),
      msg({ id: "2", channel_id: "c9", author: { id: "u9", bot: false } }),
    ]);
    const adapter = new DiscordAdapter({ transport, channelId: "c1", allow: new Set(["c1"]) });
    const inbound = await adapter.poll();
    expect(inbound.map((m) => m.id)).toEqual(["1"]);
  });

  it("sends via postJson with the {content} body to the channel-messages route", async () => {
    const { transport, posts } = fakeTransport([]);
    const adapter = new DiscordAdapter({ transport, channelId: "c1" });
    const out: OutboundMessage = { chatId: "c1", text: "reply" };
    await adapter.send(out);
    expect(posts).toEqual([{ path: "/channels/c1/messages", body: { content: "reply" } }]);
  });

  it("splits an over-2000-char reply into multiple capped sends", async () => {
    const { transport, posts } = fakeTransport([]);
    const adapter = new DiscordAdapter({ transport, channelId: "c1" });
    await adapter.send({ chatId: "c1", text: "z".repeat(2500) });
    expect(posts.length).toBeGreaterThan(1);
    for (const p of posts) expect((p.body as { content: string }).content.length).toBeLessThanOrEqual(2000);
    const total = posts.reduce((n, p) => n + (p.body as { content: string }).content.length, 0);
    expect(total).toBe(2500);
  });

  it("connect/disconnect are no-ops (stateless REST)", async () => {
    const { transport } = fakeTransport([]);
    const adapter = new DiscordAdapter({ transport, channelId: "c1" });
    await expect(adapter.connect()).resolves.toBeUndefined();
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });
});
