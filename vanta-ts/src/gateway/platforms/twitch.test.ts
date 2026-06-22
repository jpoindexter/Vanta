import { describe, it, expect } from "vitest";
import {
  TwitchAdapter,
  parseTwitchLine,
  parseTwitchMessages,
  buildTwitchPrivmsg,
  parseTwitchAllowlist,
  twitchEnabled,
  type TwitchTransport,
} from "./twitch.js";

describe("parseTwitchLine", () => {
  it("parses a channel PRIVMSG into from/target/text", () => {
    expect(
      parseTwitchLine(":bob!bob@bob.tmi.twitch.tv PRIVMSG #vanta :hello there"),
    ).toEqual({ kind: "privmsg", from: "bob", target: "#vanta", text: "hello there" });
  });

  it("strips an IRCv3 @tags prefix before parsing", () => {
    const line =
      "@badge-info=;color=#FF0000;display-name=Bob;mod=0 :bob!bob@bob.tmi.twitch.tv PRIVMSG #vanta :tagged hi";
    expect(parseTwitchLine(line)).toEqual({
      kind: "privmsg",
      from: "bob",
      target: "#vanta",
      text: "tagged hi",
    });
  });

  it("keeps colons inside the message body", () => {
    expect(parseTwitchLine(":a!a@a.tmi.twitch.tv PRIVMSG #vanta :ratio is 3:1 ok")).toEqual({
      kind: "privmsg",
      from: "a",
      target: "#vanta",
      text: "ratio is 3:1 ok",
    });
  });

  it("strips a trailing CR (Twitch lines are CRLF-terminated)", () => {
    expect(parseTwitchLine(":bob!b@b.tmi.twitch.tv PRIVMSG #c :hi\r")).toMatchObject({ text: "hi" });
  });

  it("detects a Twitch server PING and returns the token to PONG", () => {
    expect(parseTwitchLine("PING :tmi.twitch.tv")).toEqual({ kind: "ping", token: "tmi.twitch.tv" });
    expect(parseTwitchLine("PING abc123")).toEqual({ kind: "ping", token: "abc123" });
  });

  it("treats CAP/JOIN/USERSTATE/numerics, empty lines, and empty-body PRIVMSGs as other", () => {
    expect(parseTwitchLine(":tmi.twitch.tv CAP * ACK :twitch.tv/tags").kind).toBe("other");
    expect(parseTwitchLine(":vanta!vanta@vanta.tmi.twitch.tv JOIN #vanta").kind).toBe("other");
    expect(parseTwitchLine(":tmi.twitch.tv 001 vanta :Welcome, GLHF!").kind).toBe("other");
    expect(parseTwitchLine("").kind).toBe("other");
    expect(parseTwitchLine(":bob!b@b.tmi.twitch.tv PRIVMSG #c :   ").kind).toBe("other");
  });
});

describe("parseTwitchMessages", () => {
  it("parses multiple CRLF-joined lines, keeping only PRIVMSGs for the channel", () => {
    const payload =
      ":bob!b@b.tmi.twitch.tv PRIVMSG #vanta :one\r\n" +
      "PING :tmi.twitch.tv\r\n" +
      ":amy!a@a.tmi.twitch.tv PRIVMSG #vanta :two\r\n" +
      ":eve!e@e.tmi.twitch.tv PRIVMSG #other :nope\r\n";
    expect(parseTwitchMessages(payload, "#vanta")).toEqual([
      { chatId: "#vanta", text: "one", from: "bob", isGroup: true },
      { chatId: "#vanta", text: "two", from: "amy", isGroup: true },
    ]);
  });

  it("returns [] for a payload with no channel PRIVMSGs", () => {
    expect(parseTwitchMessages(":tmi.twitch.tv CAP * ACK :twitch.tv/tags\r\n", "#vanta")).toEqual([]);
  });
});

describe("buildTwitchPrivmsg", () => {
  it("builds a PRIVMSG line for a #channel", () => {
    expect(buildTwitchPrivmsg("#vanta", "hi there")).toBe("PRIVMSG #vanta :hi there");
  });
  it("normalizes a channel given without a leading #", () => {
    expect(buildTwitchPrivmsg("vanta", "hi")).toBe("PRIVMSG #vanta :hi");
  });
});

describe("parseTwitchAllowlist", () => {
  it("parses a comma list of logins, lowercasing, trimming, dropping empties", () => {
    expect(parseTwitchAllowlist({ VANTA_TWITCH_ALLOWLIST: " Bob, ALICE ," })).toEqual(
      new Set(["bob", "alice"]),
    );
  });
  it("is empty (allow-all) when unset", () => {
    expect(parseTwitchAllowlist({}).size).toBe(0);
  });
});

describe("twitchEnabled", () => {
  it("is enabled only when token, nick, and channel are all set", () => {
    expect(
      twitchEnabled({
        VANTA_TWITCH_TOKEN: "tok",
        VANTA_TWITCH_NICK: "vanta",
        VANTA_TWITCH_CHANNEL: "#vanta",
      }),
    ).toBe(true);
  });
  it("is disabled when any of token/nick/channel is missing or blank", () => {
    expect(twitchEnabled({ VANTA_TWITCH_NICK: "vanta", VANTA_TWITCH_CHANNEL: "#vanta" })).toBe(false);
    expect(
      twitchEnabled({ VANTA_TWITCH_TOKEN: "tok", VANTA_TWITCH_CHANNEL: "#vanta" }),
    ).toBe(false);
    expect(twitchEnabled({ VANTA_TWITCH_TOKEN: " ", VANTA_TWITCH_NICK: "v", VANTA_TWITCH_CHANNEL: "#c" })).toBe(
      false,
    );
    expect(twitchEnabled({})).toBe(false);
  });
});

// A fake transport: an in-memory queue with the TwitchTransport surface the adapter touches.
// No network, no WebSocket, no secret.
function makeFakeTransport(): TwitchTransport & { sent: string[]; connected: boolean; feed: (s: string) => void } {
  let buffer = "";
  const sent: string[] = [];
  return {
    sent,
    connected: false,
    async connect() {
      this.connected = true;
    },
    recv() {
      const drained = buffer;
      buffer = "";
      return drained;
    },
    send(line: string) {
      sent.push(line);
    },
    close() {
      this.connected = false;
    },
    feed(s: string) {
      buffer += s;
    },
  };
}

function makeAdapter(opts?: { allow?: Set<string>; channel?: string }) {
  const transport = makeFakeTransport();
  const adapter = new TwitchAdapter({
    transport,
    channel: opts?.channel ?? "#vanta",
    allow: opts?.allow,
  });
  return { adapter, transport };
}

describe("TwitchAdapter", () => {
  it("connects through the transport on connect()", async () => {
    const { adapter, transport } = makeAdapter();
    await adapter.connect();
    expect(transport.connected).toBe(true);
  });

  it("drains buffered inbound PRIVMSGs for the channel on poll", async () => {
    const { adapter, transport } = makeAdapter();
    await adapter.connect();
    transport.feed(":bob!b@b.tmi.twitch.tv PRIVMSG #vanta :hello\r\n");
    transport.feed(":amy!a@a.tmi.twitch.tv PRIVMSG #vanta :hi\r\n");
    expect(await adapter.poll()).toEqual([
      { chatId: "#vanta", text: "hello", from: "bob", isGroup: true },
      { chatId: "#vanta", text: "hi", from: "amy", isGroup: true },
    ]);
    // Buffer is cleared after a poll.
    expect(await adapter.poll()).toEqual([]);
  });

  it("ignores PRIVMSGs sent to a different channel", async () => {
    const { adapter, transport } = makeAdapter();
    await adapter.connect();
    transport.feed(
      ":bob!b@b.tmi.twitch.tv PRIVMSG #other :nope\r\n:bob!b@b.tmi.twitch.tv PRIVMSG #vanta :yep\r\n",
    );
    expect(await adapter.poll()).toEqual([{ chatId: "#vanta", text: "yep", from: "bob", isGroup: true }]);
  });

  it("filters inbound by the login allowlist when one is set", async () => {
    const { adapter, transport } = makeAdapter({ allow: parseTwitchAllowlist({ VANTA_TWITCH_ALLOWLIST: "Owner" }) });
    await adapter.connect();
    transport.feed(
      ":stranger!s@s.tmi.twitch.tv PRIVMSG #vanta :hi\r\n:owner!o@o.tmi.twitch.tv PRIVMSG #vanta :go\r\n",
    );
    expect(await adapter.poll()).toEqual([{ chatId: "#vanta", text: "go", from: "owner", isGroup: true }]);
  });

  it("returns [] when the transport recv throws (errors-as-values)", async () => {
    const transport = makeFakeTransport();
    transport.recv = () => {
      throw new Error("socket gone");
    };
    const adapter = new TwitchAdapter({ transport, channel: "#vanta" });
    await adapter.connect();
    expect(await adapter.poll()).toEqual([]);
  });

  it("sends one PRIVMSG per non-empty line, stripping markdown to plain text", async () => {
    const { adapter, transport } = makeAdapter();
    await adapter.connect();
    await adapter.send({ chatId: "#vanta", text: "**bold** one\n\nline two" });
    expect(transport.sent).toEqual(["PRIVMSG #vanta :bold one", "PRIVMSG #vanta :line two"]);
  });

  it("splits an over-budget reply into multiple PRIVMSGs each within the budget", async () => {
    const { adapter, transport } = makeAdapter();
    await adapter.connect();
    const long = "x".repeat(900);
    await adapter.send({ chatId: "#vanta", text: long });
    expect(transport.sent.length).toBeGreaterThan(1);
    for (const line of transport.sent) {
      // "PRIVMSG #vanta :" is 16 chars; the payload portion stays within the 450 budget.
      expect(line.slice("PRIVMSG #vanta :".length).length).toBeLessThanOrEqual(450);
    }
  });

  it("closes the transport on disconnect", async () => {
    const { adapter, transport } = makeAdapter();
    await adapter.connect();
    await adapter.disconnect();
    expect(transport.connected).toBe(false);
  });
});
