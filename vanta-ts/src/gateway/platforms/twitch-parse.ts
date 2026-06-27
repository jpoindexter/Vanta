import type { InboundMessage } from "./base.js";

// Pure line/message parsers + build/allowlist helpers for the Twitch-chat adapter (the
// adapter class + live WebSocket transport live in `twitch.ts`). Twitch chat IS
// IRC-over-WebSocket, so `parseTwitchLine` mirrors the raw `irc.ts` line parser; it is PURE
// and offline-tested — the socket only feeds raw text in. Re-exported from `twitch.ts`, so
// the public module path (`./twitch.js`) is unchanged.

export type TwitchEvent =
  | { kind: "privmsg"; from: string; target: string; text: string }
  | { kind: "ping"; token: string }
  | { kind: "other" };

/**
 * Strip the IRCv3 tag prefix (`@key=val;... `) Twitch prepends when `twitch.tv/tags` is
 * negotiated, returning the bare `:prefix COMMAND ...` line. A line with no tags is returned
 * unchanged. Pure — the parser stays correct whether or not tags are requested.
 */
function stripTags(line: string): string {
  if (!line.startsWith("@")) return line;
  const space = line.indexOf(" ");
  return space === -1 ? line : line.slice(space + 1);
}

/** Parse a `:prefix PRIVMSG <target> :<text>` line into from/target/text. Returns
 * `other` if it isn't a usable PRIVMSG (wrong command, missing target, empty body). Pure. */
function parsePrivmsg(prefix: string, rest: string): TwitchEvent {
  const parts = rest.split(" ");
  if (parts[0] !== "PRIVMSG" || parts.length < 3) return { kind: "other" };
  const target = parts[1] ?? "";
  const colon = rest.indexOf(" :");
  const text = colon === -1 ? parts.slice(2).join(" ") : rest.slice(colon + 2);
  // The Twitch login is the nick portion of `nick!user@host` (also `:nick.tmi.twitch.tv`).
  const from = prefix.split("!")[0] ?? prefix;
  if (!from || !target || !text.trim()) return { kind: "other" };
  return { kind: "privmsg", from, target, text };
}

/**
 * Parse one raw Twitch IRC line into a structured event. Handles a PRIVMSG
 * (`:nick!nick@nick.tmi.twitch.tv PRIVMSG #chan :text` → from/target/text), strips any
 * IRCv3 `@tag` prefix first, and a server PING (`PING :tmi.twitch.tv` → token, so the
 * caller can PONG). Everything else (CAP/JOIN/NOTICE/numerics/USERSTATE…) is `other`.
 * Pure — no socket, no state.
 */
export function parseTwitchLine(line: string): TwitchEvent {
  const trimmed = stripTags(line.replace(/\r$/, "").trim());
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
 * Parse a raw multi-line socket payload into inbound messages: split on CRLF/LF, parse each
 * line, and keep only the PRIVMSGs whose target matches `channel` → InboundMessage[]. PING
 * and every other line is dropped (the transport answers PINGs at the wire). Twitch carries
 * no message/reply id, so those inbound fields stay undefined; a `#channel` target is always
 * a group. Pure — offline-testable with an inline fixture.
 */
export function parseTwitchMessages(payload: string, channel: string): InboundMessage[] {
  const messages: InboundMessage[] = [];
  for (const line of payload.split("\n")) {
    const event = parseTwitchLine(line);
    if (event.kind !== "privmsg" || event.target !== channel) continue;
    messages.push({ chatId: channel, text: event.text, from: event.from, isGroup: true });
  }
  return messages;
}

/** Build a `PRIVMSG <channel> :<text>` send line (no trailing CRLF — the wire adds it).
 * The channel is normalized to a leading `#`. Pure. */
export function buildTwitchPrivmsg(channel: string, text: string): string {
  const chan = channel.startsWith("#") ? channel : `#${channel}`;
  return `PRIVMSG ${chan} :${text}`;
}

/** Parse the VANTA_TWITCH_ALLOWLIST login allowlist (comma list, lowercased). Empty/absent →
 * an empty set, which the adapter treats as "allow all". Pure. */
export function parseTwitchAllowlist(env: NodeJS.ProcessEnv): Set<string> {
  return new Set(
    (env.VANTA_TWITCH_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Twitch chat is enabled when token, nick, and channel are all configured
 * (VANTA_TWITCH_TOKEN / VANTA_TWITCH_NICK / VANTA_TWITCH_CHANNEL). Any missing = disabled.
 * Pure.
 */
export function twitchEnabled(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.VANTA_TWITCH_TOKEN?.trim() && env.VANTA_TWITCH_NICK?.trim() && env.VANTA_TWITCH_CHANNEL?.trim(),
  );
}
