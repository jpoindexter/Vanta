import { EventEmitter } from "node:events";
import { describe, it, expect } from "vitest";
import { IrcAdapter, parseIrcLine, parseNickAllowlist, isChannelTarget } from "./irc.js";

describe("parseIrcLine", () => {
  it("parses a channel PRIVMSG into from/target/text", () => {
    expect(parseIrcLine(":bob!u@host PRIVMSG #vanta :hello there")).toEqual({
      kind: "privmsg",
      from: "bob",
      target: "#vanta",
      text: "hello there",
    });
  });

  it("keeps colons inside the message body", () => {
    const e = parseIrcLine(":alice!a@h PRIVMSG #vanta :ratio is 3:1 ok");
    expect(e).toEqual({ kind: "privmsg", from: "alice", target: "#vanta", text: "ratio is 3:1 ok" });
  });

  it("strips a trailing CR (real lines are CRLF-terminated)", () => {
    expect(parseIrcLine(":bob!u@h PRIVMSG #c :hi\r")).toMatchObject({ text: "hi" });
  });

  it("detects PING and returns the token to PONG", () => {
    expect(parseIrcLine("PING :tungle.freenode.net")).toEqual({ kind: "ping", token: "tungle.freenode.net" });
    expect(parseIrcLine("PING abc123")).toEqual({ kind: "ping", token: "abc123" });
  });

  it("treats numerics, NOTICEs, empty lines, and empty-body PRIVMSGs as other", () => {
    expect(parseIrcLine(":server 001 vanta :Welcome").kind).toBe("other");
    expect(parseIrcLine(":x!y@z NOTICE #c :hi").kind).toBe("other");
    expect(parseIrcLine("").kind).toBe("other");
    expect(parseIrcLine(":bob!u@h PRIVMSG #c :   ").kind).toBe("other");
  });
});

describe("isChannelTarget", () => {
  it("flags channel targets (#/&/+/!) as groups", () => {
    expect(isChannelTarget("#vanta")).toBe(true);
    expect(isChannelTarget("&local")).toBe(true);
  });
  it("does not flag a private query (a nick) as a group", () => {
    expect(isChannelTarget("vanta")).toBe(false);
  });
});

describe("parseNickAllowlist", () => {
  it("parses a comma list of nicks, lowercasing, trimming, dropping empties", () => {
    expect(parseNickAllowlist(" Bob, ALICE ,")).toEqual(new Set(["bob", "alice"]));
  });
  it("is empty (allow-all) for undefined", () => {
    expect(parseNickAllowlist(undefined).size).toBe(0);
  });
});

// A fake socket: an EventEmitter with the net.Socket surface the adapter touches.
class FakeSocket extends EventEmitter {
  written: string[] = [];
  destroyed = false;
  setEncoding(): void {}
  write(data: string): boolean {
    this.written.push(data);
    return true;
  }
  destroy(): void {
    this.destroyed = true;
  }
  /** Push raw server text, optionally split mid-line to prove buffering. */
  feed(text: string): void {
    this.emit("data", text);
  }
}

function makeAdapter(opts?: { allow?: Set<string>; channel?: string }) {
  const fake = new FakeSocket();
  const adapter = new IrcAdapter({
    server: "irc.example:6667",
    nick: "vanta",
    channel: opts?.channel ?? "#vanta",
    allow: opts?.allow,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connectFn: (() => fake) as any,
  });
  return { adapter, fake };
}

describe("IrcAdapter", () => {
  it("registers NICK/USER and JOINs the channel on connect", async () => {
    const { adapter, fake } = makeAdapter();
    const p = adapter.connect();
    fake.emit("connect");
    await p;
    expect(fake.written).toEqual(["NICK vanta\r\n", "USER vanta 0 * :vanta\r\n", "JOIN #vanta\r\n"]);
  });

  it("buffers inbound PRIVMSGs across chunk boundaries and drains them on poll", async () => {
    const { adapter, fake } = makeAdapter();
    const p = adapter.connect();
    fake.emit("connect");
    await p;
    // First chunk ends mid-line; the rest arrives in the next chunk.
    fake.feed(":bob!u@h PRIVMSG #vanta :hel");
    fake.feed("lo\r\n:amy!a@h PRIVMSG #vanta :hi\r\n");
    const first = await adapter.poll();
    expect(first).toEqual([
      { chatId: "#vanta", text: "hello", from: "bob", isGroup: true },
      { chatId: "#vanta", text: "hi", from: "amy", isGroup: true },
    ]);
    // Buffer is cleared after a poll.
    expect(await adapter.poll()).toEqual([]);
  });

  it("answers a server PING with a PONG carrying the same token", async () => {
    const { adapter, fake } = makeAdapter();
    const p = adapter.connect();
    fake.emit("connect");
    await p;
    fake.written.length = 0;
    fake.feed("PING :irc.example\r\n");
    expect(fake.written).toEqual(["PONG :irc.example\r\n"]);
  });

  it("ignores PRIVMSGs sent to a different channel/target", async () => {
    const { adapter, fake } = makeAdapter();
    const p = adapter.connect();
    fake.emit("connect");
    await p;
    fake.feed(":bob!u@h PRIVMSG #other :nope\r\n:bob!u@h PRIVMSG #vanta :yep\r\n");
    expect(await adapter.poll()).toEqual([{ chatId: "#vanta", text: "yep", from: "bob", isGroup: true }]);
  });

  it("filters inbound by the nick allowlist when one is set", async () => {
    const { adapter, fake } = makeAdapter({ allow: parseNickAllowlist("Owner") });
    const p = adapter.connect();
    fake.emit("connect");
    await p;
    fake.feed(":stranger!s@h PRIVMSG #vanta :hi\r\n:owner!o@h PRIVMSG #vanta :go\r\n");
    expect(await adapter.poll()).toEqual([{ chatId: "#vanta", text: "go", from: "owner", isGroup: true }]);
  });

  it("sends one PRIVMSG per non-empty line", async () => {
    const { adapter, fake } = makeAdapter();
    const p = adapter.connect();
    fake.emit("connect");
    await p;
    fake.written.length = 0;
    await adapter.send({ chatId: "#vanta", text: "line one\n\nline two" });
    expect(fake.written).toEqual(["PRIVMSG #vanta :line one\r\n", "PRIVMSG #vanta :line two\r\n"]);
  });

  it("normalizes a channel given without a leading #", async () => {
    const { adapter, fake } = makeAdapter({ channel: "vanta" });
    const p = adapter.connect();
    fake.emit("connect");
    await p;
    expect(fake.written).toContain("JOIN #vanta\r\n");
  });

  it("QUITs and destroys the socket on disconnect", async () => {
    const { adapter, fake } = makeAdapter();
    const p = adapter.connect();
    fake.emit("connect");
    await p;
    await adapter.disconnect();
    expect(fake.written).toContain("QUIT :bye\r\n");
    expect(fake.destroyed).toBe(true);
  });

  it("rejects connect on a socket error", async () => {
    const { adapter, fake } = makeAdapter();
    const p = adapter.connect();
    fake.emit("error", new Error("ECONNREFUSED"));
    await expect(p).rejects.toThrow(/ECONNREFUSED/);
  });
});
