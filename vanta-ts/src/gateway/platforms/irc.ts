import net from "node:net";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";

// IRC counts a message in UTF-8 BYTES. The protocol caps a line at 512 bytes
// INCLUDING the `PRIVMSG <target> :` prefix + CRLF; ~430 bytes of payload is the
// safe budget that survives any realistic channel name + the trailing \r\n.
const IRC_BYTE_BUDGET = 430;

// IRC adapter over a raw TCP socket (Node `net`, zero new dep). IRC is push, not
// poll: PRIVMSG lines arriving on the socket are buffered as they come in, and
// `poll()` drains + clears that buffer to feed the gateway's tick loop. connect
// registers NICK/USER and JOINs the channel; send is PRIVMSG; PING→PONG keeps the
// link alive. chatId IS the channel (replies PRIVMSG back to it) and `from` is the
// sender nick. The line parser (parseIrcLine) is PURE and offline-tested — the
// socket only feeds raw text in. Set VANTA_IRC_SERVER (host:port), VANTA_IRC_NICK,
// VANTA_IRC_CHANNEL; optional VANTA_IRC_ALLOW = comma list of accepted nicks.

const DEFAULT_PORT = 6667;
const CONNECT_TIMEOUT_MS = 10_000;

export type IrcEvent =
  | { kind: "privmsg"; from: string; target: string; text: string }
  | { kind: "ping"; token: string }
  | { kind: "other" };

/** Parse a `:prefix PRIVMSG <target> :<text>` line. Returns `other` if it
 * isn't a usable PRIVMSG (wrong command, missing target, empty body). Pure. */
function parsePrivmsg(prefix: string, rest: string): IrcEvent {
  const parts = rest.split(" ");
  if (parts[0] !== "PRIVMSG" || parts.length < 3) return { kind: "other" };
  const target = parts[1] ?? "";
  const colon = rest.indexOf(" :");
  const text = colon === -1 ? parts.slice(2).join(" ") : rest.slice(colon + 2);
  const from = prefix.split("!")[0] ?? prefix;
  if (!from || !target || !text.trim()) return { kind: "other" };
  return { kind: "privmsg", from, target, text };
}

/**
 * Parse one raw IRC line into a structured event. Handles a PRIVMSG
 * (`:nick!user@host PRIVMSG #chan :text` → from/target/text) and a server PING
 * (`PING :token` → token, so the caller can PONG). Everything else is `other`.
 * Pure — no socket, no state.
 */
export function parseIrcLine(line: string): IrcEvent {
  const trimmed = line.replace(/\r$/, "").trim();
  if (!trimmed) return { kind: "other" };
  if (trimmed.startsWith("PING")) {
    return { kind: "ping", token: trimmed.slice(4).trim().replace(/^:/, "") };
  }
  if (!trimmed.startsWith(":")) return { kind: "other" };
  const space = trimmed.indexOf(" ");
  if (space === -1) return { kind: "other" };
  return parsePrivmsg(trimmed.slice(1, space), trimmed.slice(space + 1));
}

/**
 * True when an IRC target is a channel (a group), false for a private query.
 * RFC 2812 channel names start with `#`, `&`, `+`, or `!`. IRC carries no
 * message id or reply id, so those inbound fields stay undefined by design.
 * Pure.
 */
export function isChannelTarget(target: string): boolean {
  return /^[#&+!]/.test(target);
}

/** Parse the VANTA_IRC_ALLOW nick allowlist (empty = allow all). Pure. */
export function parseNickAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
}

type IrcOpts = {
  server: string;
  nick: string;
  channel: string;
  allow?: Set<string>;
  connectFn?: typeof net.createConnection;
};

export class IrcAdapter implements PlatformAdapter {
  readonly id = "irc";
  private socket?: net.Socket;
  private rxBuffer = "";
  private inbound: InboundMessage[] = [];
  private readonly host: string;
  private readonly port: number;
  private readonly nick: string;
  private readonly channel: string;
  private readonly allow: Set<string>;
  private readonly connectFn: typeof net.createConnection;

  constructor(opts: IrcOpts) {
    const [host, portRaw] = opts.server.split(":");
    this.host = host ?? opts.server;
    this.port = portRaw ? Number.parseInt(portRaw, 10) || DEFAULT_PORT : DEFAULT_PORT;
    this.nick = opts.nick;
    this.channel = opts.channel.startsWith("#") ? opts.channel : `#${opts.channel}`;
    this.allow = opts.allow ?? new Set();
    this.connectFn = opts.connectFn ?? net.createConnection;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.connectFn({ host: this.host, port: this.port });
      this.socket = socket;
      socket.setEncoding("utf8");
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`IRC: connect timed out to ${this.host}:${this.port}`));
      }, CONNECT_TIMEOUT_MS);
      socket.on("data", (chunk: string) => this.ingest(chunk));
      socket.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      socket.once("connect", () => {
        clearTimeout(timer);
        this.write(`NICK ${this.nick}`);
        this.write(`USER ${this.nick} 0 * :${this.nick}`);
        this.write(`JOIN ${this.channel}`);
        resolve();
      });
    });
  }

  /** Feed raw socket text through the pure parser, splitting on CRLF. */
  private ingest(chunk: string): void {
    this.rxBuffer += chunk;
    const lines = this.rxBuffer.split("\n");
    this.rxBuffer = lines.pop() ?? "";
    for (const line of lines) {
      const event = parseIrcLine(line);
      if (event.kind === "ping") {
        this.write(`PONG :${event.token}`);
      } else if (event.kind === "privmsg" && event.target === this.channel) {
        // IRC has no message/reply ids; isGroup is the only inbound field the
        // protocol genuinely provides (a `#`/`&` target is a channel = a group).
        this.inbound.push({
          chatId: this.channel,
          text: event.text,
          from: event.from,
          isGroup: isChannelTarget(event.target),
        });
      }
    }
  }

  private write(command: string): void {
    try {
      this.socket?.write(`${command}\r\n`);
    } catch {
      /* errors-as-values: a write failure must not throw through the gateway loop */
    }
  }

  async disconnect(): Promise<void> {
    this.write("QUIT :bye");
    this.socket?.destroy();
    this.socket = undefined;
  }

  /** Drain and clear the inbound PRIVMSG buffer (honoring the nick allowlist). */
  async poll(): Promise<InboundMessage[]> {
    const drained = this.inbound;
    this.inbound = [];
    if (this.allow.size === 0) return drained;
    return drained.filter((m) => m.from && this.allow.has(m.from.toLowerCase()));
  }

  async send(msg: OutboundMessage): Promise<void> {
    // IRC is plain text — strip markdown to readable prose (code spans survive)
    // BEFORE splitting so literal `**`/``` never reach the channel.
    const formatted = formatForDialect(msg.text, "plain");
    // Break the reply on newlines under the byte budget; a single line longer
    // than the budget is hard-split so the server never truncates it mid-send.
    for (const part of splitForLimit(formatted, IRC_BYTE_BUDGET, "bytes")) {
      for (const line of part.split("\n")) {
        if (line.trim()) this.write(`PRIVMSG ${msg.chatId} :${line}`);
      }
    }
  }
}
