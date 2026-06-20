// VANTA-CHANNEL-MSG — pure formatter that turns an inbound platform message
// (Telegram/Discord/etc., shape = gateway/platforms/base.ts `InboundMessage`)
// into one compact transcript line, e.g. "📨 telegram @alice: hi". Pure +
// unit-tested. NOT wired this round — see the wiring note at the bottom.

import type { InboundMessage } from "./platforms/base.js";

/** Default cap on rendered text before truncation (chars, post-sanitize). */
export const DEFAULT_TEXT_MAX = 280;

/** Single-char ellipsis appended when text is truncated. */
const ELLIPSIS = "…";

/** Generic inbound glyph for an unknown/unmapped platform. */
const GENERIC_PREFIX = "📨";

// Per-platform display prefix (glyph + lowercase label). An unknown platform
// falls back to the generic glyph + the raw (sanitized) platform id, so a new
// adapter still renders sensibly without a registry edit.
const PLATFORM_PREFIX: Readonly<Record<string, string>> = {
  telegram: "📨 telegram",
  discord: "🎮 discord",
  slack: "💬 slack",
  signal: "🔒 signal",
  imessage: "💬 imessage",
  whatsapp: "🟢 whatsapp",
  matrix: "🟩 matrix",
  irc: "💬 irc",
  mattermost: "🟦 mattermost",
};

// ESC-led terminal sequences — stripped FIRST so inbound text can't inject
// color/cursor/title escapes into the operator's transcript. Three forms:
//   OSC: ESC ] ... terminated by BEL (\x07) or ST (ESC \)  — e.g. set-title
//   CSI: ESC [ <params> <final-byte 0x40-0x7e>             — e.g. SGR color
//   other ESC <single printable byte>                      — leftover 2-char seqs
// eslint-disable-next-line no-control-regex
const ESC_SEQUENCES = /\x1b\][\s\S]*?(?:\x07|\x1b\\)|\x1b\[[0-9;?]*[\x40-\x7e]|\x1b[\x20-\x7e]/g;

// Any remaining C0/C1 control char (incl. newline \x0a, tab \x09, CR \x0d, DEL
// \x7f, a lone ESC \x1b) → a space, so the result is strictly one line.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f-\x9f]/g;

/** Collapsed runs of whitespace → a single space. */
const WHITESPACE_RUN = /\s+/g;

/**
 * Strip terminal escape sequences + control chars and collapse to one trimmed
 * line. Pure. Defends the transcript against escape injection from a remote
 * sender; newlines/tabs become spaces so the line never wraps the layout.
 */
export function sanitizeForLine(text: string): string {
  return text
    .replace(ESC_SEQUENCES, "")
    .replace(CONTROL_CHARS, " ")
    .replace(WHITESPACE_RUN, " ")
    .trim();
}

/**
 * The display prefix for a platform: its glyph + label, or the generic glyph +
 * the platform id for an unknown one. The id is sanitized so a hostile platform
 * field can't inject escapes either. Pure.
 */
export function channelMessagePrefix(platform: string): string {
  const key = sanitizeForLine(platform).toLowerCase();
  return PLATFORM_PREFIX[key] ?? `${GENERIC_PREFIX} ${key || "channel"}`;
}

/** Truncate to `max` chars, appending an ellipsis when it actually clips. Pure. */
function truncate(text: string, max: number): string {
  if (max <= 0 || text.length <= max) return text;
  return text.slice(0, Math.max(0, max - ELLIPSIS.length)) + ELLIPSIS;
}

export type ChannelDisplayOptions = {
  /** Max chars of message text before truncation (default DEFAULT_TEXT_MAX). */
  textMax?: number;
};

/**
 * Format one inbound platform message as a compact, sanitized, single-line
 * transcript entry: "<prefix> @<sender>: <text>" (the "@<sender>" segment is
 * dropped when the sender is absent/blank). Text is sanitized (escapes/control
 * chars stripped, collapsed to one line) then truncated with an ellipsis. The
 * sender is sanitized too. Pure.
 */
export function formatChannelMessage(
  msg: Pick<InboundMessage, "text" | "from">,
  platform: string,
  opts: ChannelDisplayOptions = {},
): string {
  const max = opts.textMax ?? DEFAULT_TEXT_MAX;
  const prefix = channelMessagePrefix(platform);
  const sender = sanitizeForLine(msg.from ?? "");
  const text = truncate(sanitizeForLine(msg.text), max);
  const who = sender ? `@${sender}: ` : "";
  return `${prefix} ${who}${text}`.trimEnd();
}

// WIRING (not done this round — pure formatter only, mirrors the clarity gate):
//   • INBOUND surface: gateway/run.ts `pollPlatform` receives `InboundMessage[]`
//     from each adapter's `poll()`. There, BEFORE handing a message to the agent
//     turn, call `formatChannelMessage(msg, adapter.id)` to emit the compact line.
//   • TRANSCRIPT surface: route that line through the existing "note" entry —
//     ui/transcript.tsx `NoteView` (the `kind:"note"` row) renders system/EF
//     nudges, so a channel line surfaces inline as a note (no new entry kind).
