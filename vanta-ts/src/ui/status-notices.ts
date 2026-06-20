// Transient one-line notices that render in a dedicated area just ABOVE the
// status line (e.g. "⚠ kernel reconnecting", "✓ MCP mounted", "update
// available") and auto-expire after a TTL. This module is the PURE/immutable
// state model only — no React, no clock. `nowMs` is injected into every op so
// the ops stay deterministic and unit-testable (no Date.now reach-in).
//
// Render wire (NOT built this round, named for clarity-gate): a host renders
// `visibleNotices(notices, nowMs)` as dim rows in `ui/app.tsx`, in the live
// bottom region immediately ABOVE <StatusBar/> (ui/status-bar.tsx) — one
// `<Text dimColor>` per notice using `formatNotice(notice)`. With no live
// notices `visibleNotices` returns `[]`, so the host renders nothing — current
// behavior is preserved (no notices = nothing rendered).

import { GLYPHS } from "../term/figures.js";

/** A transient notice. `level` colors only its glyph; `expiresAtMs` is absolute. */
export type NoticeLevel = "info" | "warn" | "success";

export type Notice = {
  id: string;
  text: string;
  level: NoticeLevel;
  expiresAtMs: number;
};

/** Default time-to-live for a notice (8s) when a caller doesn't pass one. */
export const DEFAULT_NOTICE_TTL_MS = 8_000;

/** Cap on retained notices — newest win when the cap is exceeded. */
export const MAX_NOTICES = 3;

// Control chars (incl. ESC \x1b / BEL \x07 / newlines) — stripped so notice text
// can never inject an escape sequence into the row (no escape injection). Mirrors
// term/terminal-title.ts sanitizePart.
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");
const WHITESPACE_RUN = /\s+/g;

/** Strip control chars, collapse whitespace runs to single spaces, trim. */
function sanitizeText(text: string): string {
  return text.replace(CONTROL_CHARS, " ").replace(WHITESPACE_RUN, " ").trim();
}

let noticeSeq = 0;
/** Monotonic id — `nowMs` keeps it readable, the counter keeps it unique even
 *  for notices added within the same millisecond. */
function nextNoticeId(nowMs: number): string {
  noticeSeq += 1;
  return `n-${nowMs}-${noticeSeq}`;
}

/** Add-op options: the injected clock + an optional TTL override. `nowMs` is
 *  required (no Date.now reach-in); `ttlMs` defaults to {@link DEFAULT_NOTICE_TTL_MS}. */
export type AddNoticeOpts = { nowMs: number; ttlMs?: number };

/**
 * Append a notice (immutable): assigns an id, sets expiry = `nowMs + ttlMs`,
 * sanitizes the text, and caps the list to {@link MAX_NOTICES} keeping the
 * NEWEST. Returns a new array; the input is never mutated. (Time/ttl ride in an
 * options object so the op stays at ≤4 params — the size-gate limit.)
 */
export function addNotice(
  notices: readonly Notice[],
  text: string,
  level: NoticeLevel,
  opts: AddNoticeOpts,
): Notice[] {
  const ttlMs = opts.ttlMs ?? DEFAULT_NOTICE_TTL_MS;
  const notice: Notice = {
    id: nextNoticeId(opts.nowMs),
    text: sanitizeText(text),
    level,
    expiresAtMs: opts.nowMs + ttlMs,
  };
  const next = [...notices, notice];
  // Cap to the newest MAX_NOTICES (drop oldest from the front).
  return next.length > MAX_NOTICES ? next.slice(next.length - MAX_NOTICES) : next;
}

/** Drop notices whose TTL has elapsed (`expiresAtMs <= nowMs`). New array. */
export function pruneExpired(notices: readonly Notice[], nowMs: number): Notice[] {
  return notices.filter((n) => n.expiresAtMs > nowMs);
}

/** The live notices at `nowMs` (expired excluded). New array; never mutates. */
export function visibleNotices(notices: readonly Notice[], nowMs: number): Notice[] {
  return pruneExpired(notices, nowMs);
}

/** The glyph for a notice level: ✔ success · ✘/⚠ warn · · info. */
export function noticeGlyph(level: NoticeLevel): string {
  switch (level) {
    case "success":
      return GLYPHS.check;
    case "warn":
      return GLYPHS.cross;
    case "info":
      return GLYPHS.mid;
  }
}

/** The one-line label for a notice: "<glyph> <text>", control chars stripped.
 *  (Text is sanitized at add time; re-sanitized here so a hand-built Notice is
 *  also injection-safe.) */
export function formatNotice(notice: Notice): string {
  return `${noticeGlyph(notice.level)} ${sanitizeText(notice.text)}`;
}
