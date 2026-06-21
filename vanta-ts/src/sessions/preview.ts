import type { Message } from "../types.js";
import type { SessionMeta } from "./store.js";
import { formatMessageTime } from "../term/message-time.js";

// SESSION-PREVIEW — a compact, identify-the-right-one content preview for the
// resume picker. PURE + injected-now (no Date.now): `buildSessionPreview` turns a
// session's metadata + messages into the fields an operator needs to recognize a
// session at a glance; `formatSessionPreview` renders those fields into a block.
//
// Defensive by design: session content is untrusted text, so every snippet is
// control-/ANSI-stripped (a saved prompt can't inject escape sequences into the
// picker) and length-capped. An empty session (no user/assistant turns) collapses
// to a minimal "<title> · (empty)" line.

/** Max characters for the first-prompt / last-snippet excerpts. */
const SNIPPET_LEN = 80;

/** The subset of session fields a preview needs. `messages` drives turns + snippets. */
export type PreviewSession = Pick<SessionMeta, "title" | "started"> & {
  messages: Message[];
};

/** The recognizable fields for one session, derived purely from metadata + messages. */
export type SessionPreview = {
  /** Human title (already derived upstream by deriveTitle). */
  title: string;
  /** User-message count — the conversational "turn" count. */
  turns: number;
  /** Relative age of `started`, via formatMessageTime (e.g. "3m ago", "Jun 3"). */
  ageLabel: string;
  /** First user message, control-stripped + truncated. "" when there is none. */
  firstPrompt: string;
  /** Last user/assistant message, control-stripped + truncated. "" when none. */
  lastSnippet: string;
  /** True when the session has no user/assistant turns → renders minimally. */
  empty: boolean;
};

/**
 * Strip control + ANSI escape sequences and collapse whitespace to single
 * spaces, then trim. Untrusted session content flows through here before it
 * reaches the terminal, so a stored prompt can't smuggle in cursor moves,
 * colors, or other escapes. Pure and idempotent on already-clean text.
 */
export function stripControl(text: string): string {
  // CSI/ANSI escape sequences: ESC [ params final-byte (e.g. cursor moves, colors).
  // eslint-disable-next-line no-control-regex
  const noAnsi = text.replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, "");
  // Remaining C0/C1 control chars (incl. bare ESC, BEL, backspace) → space.
  // eslint-disable-next-line no-control-regex
  const noCtrl = noAnsi.replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
  return noCtrl.replace(/\s+/g, " ").trim();
}

/** Control-strip then cap to SNIPPET_LEN chars, appending an ellipsis when cut. */
function excerpt(text: string): string {
  const clean = stripControl(text);
  return clean.length > SNIPPET_LEN ? `${clean.slice(0, SNIPPET_LEN - 1)}…` : clean;
}

/** Content of a conversational message, or "" for roles without plain content. */
function contentOf(message: Message): string {
  return message.role === "user" || message.role === "assistant" ? message.content : "";
}

/**
 * Pure: build the recognizable preview fields for one session.
 *
 * - turns = count of `user` messages (the conversational turn count).
 * - ageLabel = formatMessageTime(started-as-epoch-ms, nowMs) — relative.
 * - firstPrompt = the first `user` message, control-stripped + truncated.
 * - lastSnippet = the last `user`/`assistant` message, control-stripped + truncated.
 * - empty = no user/assistant turns at all → caller renders the minimal line.
 *
 * `nowMs` is injected (no clock read here), so age is deterministic + testable.
 * An unparseable `started` clamps the age to "just now" rather than NaN.
 */
export function buildSessionPreview(session: PreviewSession, nowMs: number): SessionPreview {
  const turns = session.messages.filter((m) => m.role === "user").length;
  const firstUser = session.messages.find((m) => m.role === "user");
  const lastTurn = [...session.messages].reverse().find(
    (m) => m.role === "user" || m.role === "assistant",
  );
  const startedMs = Date.parse(session.started);
  const eventMs = Number.isNaN(startedMs) ? nowMs : startedMs;
  return {
    title: session.title,
    turns,
    ageLabel: formatMessageTime(eventMs, nowMs),
    firstPrompt: firstUser ? excerpt(contentOf(firstUser)) : "",
    lastSnippet: lastTurn ? excerpt(contentOf(lastTurn)) : "",
    empty: !firstUser && !lastTurn,
  };
}

/** "N turns" / "1 turn" — singular at exactly one. */
function turnsLabel(turns: number): string {
  return turns === 1 ? "1 turn" : `${turns} turns`;
}

/**
 * Pure: render a preview into the picker block.
 *
 * - Empty session → one minimal line: "▸ <title> · (empty)".
 * - Otherwise: a header line "▸ <title>  · N turns · <age>" followed by an
 *   indented first-prompt line, and (when distinct from the first prompt) an
 *   indented last-exchange line, so the operator sees both ends of the thread.
 */
export function formatSessionPreview(preview: SessionPreview): string {
  if (preview.empty) return `▸ ${preview.title} · (empty)`;
  const header = `▸ ${preview.title}  · ${turnsLabel(preview.turns)} · ${preview.ageLabel}`;
  const body: string[] = [];
  if (preview.firstPrompt) body.push(`    ${preview.firstPrompt}`);
  if (preview.lastSnippet && preview.lastSnippet !== preview.firstPrompt) {
    body.push(`    ↳ ${preview.lastSnippet}`);
  }
  return [header, ...body].join("\n");
}
