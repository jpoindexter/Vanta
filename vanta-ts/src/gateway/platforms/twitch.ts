import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";
import { buildTwitchPrivmsg, parseTwitchLine, parseTwitchMessages } from "./twitch-parse.js";

// Twitch-chat adapter — Twitch chat IS IRC-over-WebSocket, so this mirrors the raw
// `irc.ts` adapter but swaps the TCP socket for a global `WebSocket` to
// wss://irc-ws.chat.twitch.tv:443. The handshake is PASS oauth:<token> / NICK <nick>
// / JOIN #channel; the server PINGs and we PONG to stay alive; inbound PRIVMSG lines
// are buffered as they arrive and `poll()` drains them into the gateway tick loop.
// chatId IS the channel (`#channel`, so a reply PRIVMSGs back to it) and `from` is the
// sender's Twitch login. The line parsers (parseTwitchLine/parseTwitchMessages) are PURE
// and live in `twitch-parse.ts` (re-exported below so `./twitch.js` is unchanged). Set
// VANTA_TWITCH_TOKEN (the oauth token, WITHOUT the `oauth:` prefix — the wire adds it),
// VANTA_TWITCH_NICK, VANTA_TWITCH_CHANNEL; optional VANTA_TWITCH_ALLOWLIST = comma list of
// accepted logins.
//
// The oauth token is a SECRET: it is read ONLY inside `httpTransport` (the wire), into the
// PASS line — never stored on the adapter and never a literal elsewhere in this file.

// Re-export the pure helpers so importers of `./twitch.js` see an unchanged surface.
export type { TwitchEvent } from "./twitch-parse.js";
export {
  parseTwitchLine,
  parseTwitchMessages,
  buildTwitchPrivmsg,
  parseTwitchAllowlist,
  twitchEnabled,
} from "./twitch-parse.js";

const TWITCH_WS_URL = "wss://irc-ws.chat.twitch.tv:443";
const CONNECT_TIMEOUT_MS = 10_000;
// Twitch caps a single chat message at ~500 characters; reply text over that is split into
// multiple PRIVMSGs before the wire so the server never truncates it mid-send.
const TWITCH_TEXT_BUDGET = 450;

/**
 * The injected Twitch transport — the live boundary that owns the WebSocket. `connect` opens
 * the socket and performs the PASS/NICK/JOIN handshake; `recv` drains buffered inbound text
 * (the transport answers server PINGs itself); `send` writes one raw IRC line; `close` tears
 * the socket down. Tests pass a fake transport so no real network — and no secret — is touched.
 */
export type TwitchTransport = {
  connect: () => Promise<void>;
  recv: () => string;
  send: (line: string) => void;
  close: () => void;
};

export class TwitchAdapter implements PlatformAdapter {
  readonly id = "twitch";
  private readonly transport: TwitchTransport;
  private readonly channel: string;
  private readonly allow: Set<string>;

  constructor(opts: { transport: TwitchTransport; channel: string; allow?: Set<string> }) {
    this.transport = opts.transport;
    this.channel = opts.channel.startsWith("#") ? opts.channel : `#${opts.channel}`;
    this.allow = opts.allow ?? new Set();
  }

  async connect(): Promise<void> {
    await this.transport.connect();
  }

  async disconnect(): Promise<void> {
    this.transport.close();
  }

  /** Drain the transport's inbound buffer, parse PRIVMSGs for our channel, honor the
   * login allowlist. Errors-as-values: a transport/parse failure yields []. */
  async poll(): Promise<InboundMessage[]> {
    let payload = "";
    try {
      payload = this.transport.recv();
    } catch {
      return [];
    }
    const messages = parseTwitchMessages(payload, this.channel);
    if (this.allow.size === 0) return messages;
    return messages.filter((m) => m.from && this.allow.has(m.from.toLowerCase()));
  }

  async send(msg: OutboundMessage): Promise<void> {
    // Twitch renders plain text — strip markdown to readable prose BEFORE splitting so
    // literal `**`/``` never reach the channel, then PRIVMSG each line/part.
    const formatted = formatForDialect(msg.text, "plain");
    for (const part of splitForLimit(formatted, TWITCH_TEXT_BUDGET, "chars")) {
      for (const line of part.split("\n")) {
        if (!line.trim()) continue;
        try {
          this.transport.send(buildTwitchPrivmsg(msg.chatId, line));
        } catch {
          /* errors-as-values: a send failure must not throw through the gateway loop */
        }
      }
    }
  }
}

/** Build the handshake lines (PASS/NICK/JOIN) — the wire reads the token ONLY here, into
 * the PASS line (`oauth:` prefix added). The token is never returned in any other form. Pure. */
function handshakeLines(token: string, nick: string, channel: string): string[] {
  const chan = channel.startsWith("#") ? channel : `#${channel}`;
  return [`PASS oauth:${token}`, `NICK ${nick}`, `JOIN ${chan}`];
}

/**
 * Build the live Twitch transport over the global `WebSocket` (Node 22). THE WIRE: the oauth
 * token (a secret) is read ONLY here, into the PASS line — never stored on the adapter and
 * never a literal elsewhere. `connect` opens wss://irc-ws.chat.twitch.tv:443, sends the
 * PASS/NICK/JOIN handshake, and buffers inbound frames; server PINGs are answered with PONG at
 * the wire (so `recv` only surfaces real chat). `recv` returns + clears the buffer; `send`
 * writes one raw line (CRLF-terminated); `close` shuts the socket. Live use needs a real token.
 */
// Open the Twitch IRC-over-WebSocket connection: handshake on open, answer server PINGs at
// the wire, buffer inbound data. Split out of `httpTransport` to keep that fn under the
// size gate. `onData` accumulates, `write` sends, `setWs` hands the live socket back.
function openTwitchSocket(opts: {
  token: string;
  nick: string;
  channel: string;
  write: (line: string) => void;
  onData: (data: string) => void;
  setWs: (ws: WebSocket) => void;
}): Promise<void> {
  const { token, nick, channel, write, onData, setWs } = opts;
  return new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(TWITCH_WS_URL);
    setWs(socket);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Twitch: connect timed out to ${TWITCH_WS_URL}`));
    }, CONNECT_TIMEOUT_MS);
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("Twitch: websocket error"));
    });
    socket.addEventListener("message", (ev: MessageEvent) => {
      const data = typeof ev.data === "string" ? ev.data : String(ev.data);
      for (const line of data.split("\n")) {
        const event = parseTwitchLine(line);
        if (event.kind === "ping") write(`PONG :${event.token}`);
      }
      onData(data);
    });
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      for (const line of handshakeLines(token, nick, channel)) write(line);
      resolve();
    });
  });
}

export function httpTransport(token: string, nick: string, channel: string): TwitchTransport {
  let ws: WebSocket | undefined;
  let buffer = "";
  const write = (line: string): void => {
    try {
      ws?.send(`${line}\r\n`);
    } catch {
      /* errors-as-values: a send failure must not throw through the gateway loop */
    }
  };
  return {
    connect: () =>
      openTwitchSocket({
        token,
        nick,
        channel,
        write,
        onData: (data) => {
          buffer += data;
        },
        setWs: (socket) => {
          ws = socket;
        },
      }),
    recv: () => {
      const drained = buffer;
      buffer = "";
      return drained;
    },
    send: write,
    close: () => {
      try {
        ws?.close();
      } catch {
        /* nothing to tear down */
      }
    },
  };
}
