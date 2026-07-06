import type { Message } from "../types.js";
import { flattenMessageText } from "../agent/flatten-text.js";

// AUTO-TITLE — auto-generate a session name from the first substantive exchange
// via a CHEAP model (e.g. Haiku), an AUXILIARY task (cf. routing/vision.ts and
// VANTA_MODEL_CHEAP). Opt-in (VANTA_AUTO_TITLE=1); default off keeps the existing
// first-message `deriveTitle` behavior in sessions/store.ts unchanged. The prompt
// build, sanitization, and generation orchestration are pure + injectable so
// tests run with NO real LLM. Generation is errors-as-values — a failing or blank
// model call returns the caller's fallback (the current derived title); it never
// throws across the boundary.

/** Max title length — mirrors the 60-char convention in sessions/store.ts. */
const MAX_TITLE_LEN = 60;
/** How many words the model is asked to keep the title to. */
const MAX_TITLE_WORDS = 6;
/** How many leading messages of the exchange to feed the model. */
const EXCHANGE_LIMIT = 4;
/** Cap per message line so one long turn can't dominate the prompt. */
const MESSAGE_CHARS = 400;

/** A model call narrowed to a title task — inject the cheap provider here. */
export type TitleComplete = (prompt: string) => Promise<string>;

export type TitleGenDeps = {
  /** The cheap-model call. May reject or return blank; both fall back. */
  complete: TitleComplete;
  /** The current derived title — returned whenever generation can't produce one. */
  fallback: string;
};

/** Opt-in gate: title auto-generation runs only when VANTA_AUTO_TITLE=1. */
export function titleGenEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.VANTA_AUTO_TITLE === "1";
}

/** One transcript line for the prompt, role-tagged and length-capped. */
function formatLine(message: Message): string {
  const role = message.role;
  const text = flattenMessageText("content" in message ? message.content : "");
  const oneLine = text.replace(/\s+/g, " ").trim().slice(0, MESSAGE_CHARS);
  return `${role}: ${oneLine}`;
}

/**
 * Pure: build the instruction asking a cheap model for a short title from the
 * first user/assistant exchange. References only the leading turns (system
 * messages dropped — they're prompt scaffolding, not conversation). Returns a
 * single self-contained prompt string.
 */
export function buildTitlePrompt(messages: Message[]): string {
  const exchange = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(0, EXCHANGE_LIMIT)
    .map(formatLine)
    .join("\n");
  return [
    `Write a concise session title (at most ${MAX_TITLE_WORDS} words) that names`,
    "what this conversation is about. Use plain text — no quotes, no trailing",
    "punctuation, no prefix like 'Title:'. Reply with the title only.",
    "",
    "Conversation:",
    exchange,
  ].join("\n");
}

/**
 * Pure: normalize a raw model title. Trim, strip surrounding quotes, collapse
 * newlines (and any whitespace) to single spaces, cap to 60 chars, and fall back
 * to `fallback` when the result is empty/blank. Idempotent on already-clean input.
 */
export function sanitizeTitle(raw: string, fallback: string): string {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  const unquoted = collapsed.replace(/^["'`]+|["'`]+$/g, "").trim();
  if (!unquoted) return fallback;
  return unquoted.length > MAX_TITLE_LEN
    ? `${unquoted.slice(0, MAX_TITLE_LEN - 3)}...`
    : unquoted;
}

/**
 * Generate a session title from the conversation via the injected cheap model.
 * Errors-as-values: a rejected call OR a blank/whitespace result yields
 * `deps.fallback` (the existing derived title). Never throws across the boundary.
 *
 * Wiring (NOT done this round — mirrors the clarity-gate): the live call site is
 * `sessions/store.ts` `saveSession`, at the post-first-turn save point (once the
 * first substantive user/assistant exchange exists). There, build a
 * `TitleComplete` from a cheap provider — `resolveRoutedProvider(env, "summarize
 * title")` (routes to VANTA_MODEL_CHEAP) wrapped as `(p) => provider.complete([{
 * role: "user", content: p }], []).then((r) => r.text)` — and pass `{ complete,
 * fallback: deriveTitle(messages) }`. Guard the whole branch behind
 * `titleGenEnabled(env)` so the default path stays `deriveTitle` exactly.
 */
export async function generateSessionTitle(
  messages: Message[],
  deps: TitleGenDeps,
): Promise<string> {
  try {
    const raw = await deps.complete(buildTitlePrompt(messages));
    return sanitizeTitle(raw, deps.fallback);
  } catch {
    return deps.fallback;
  }
}
