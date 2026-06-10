import type { Message } from "./types.js";
import { compactionReminder } from "./repl/compaction-remind.js";

const CHARS_PER_TOKEN = 4;

// Lone (unpaired) UTF-16 surrogate code units — high surrogate not followed by a
// low one, or a low not preceded by a high. These slip in from truncated tool
// output and make the model API reject the whole request with an opaque 400.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function stripSurrogates(text: string): string {
  return text.replace(LONE_SURROGATE, "");
}

/**
 * Final pre-flight scrub right before an API call. Two cheap defenses against
 * silent 400s that are painful to diagnose:
 *  1. Drop any `tool` message whose `toolCallId` has no matching assistant
 *     `tool_calls` id anywhere in the set (orphaned by trim/compression).
 *  2. Strip lone Unicode surrogates from all message content.
 * Pure — returns a new array; the live transcript is untouched.
 */
export function sanitizeMessages(messages: Message[]): Message[] {
  const callIds = new Set<string>();
  for (const m of messages) {
    if (m.role === "assistant") {
      for (const tc of m.toolCalls ?? []) callIds.add(tc.id);
    }
  }

  const out: Message[] = [];
  for (const m of messages) {
    if (m.role === "tool") {
      if (!callIds.has(m.toolCallId)) continue; // orphaned result → drop
      out.push({ ...m, content: stripSurrogates(m.content) });
    } else {
      out.push({ ...m, content: stripSurrogates(m.content) });
    }
  }
  return out;
}

export function estimateTokens(messages: Message[]): number {
  return Math.ceil(JSON.stringify(messages).length / CHARS_PER_TOKEN);
}

type TrimOptions = {
  protectFirst?: number;
  protectLast?: number;
  thresholdPct?: number;
  /** When set, a goal-reminder note is injected right after system messages on compression. */
  activeGoalText?: string;
};

/**
 * Trim conversation history when it nears the context window. Keeps all system
 * messages, the first N and last M non-system messages, and drops the middle.
 * Guards against starting the tail on an orphaned tool result (would 400).
 */
export function trimMessages(
  messages: Message[],
  contextWindow: number,
  opts: TrimOptions = {},
): Message[] {
  const protectFirst = opts.protectFirst ?? 3;
  const protectLast = opts.protectLast ?? 6;
  const threshold = (opts.thresholdPct ?? 75) / 100;

  if (estimateTokens(messages) <= contextWindow * threshold) return messages;

  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  if (rest.length <= protectFirst + protectLast) return messages;

  const head = rest.slice(0, protectFirst);
  let tail = rest.slice(-protectLast);
  // A leading tool result with no preceding assistant tool_call breaks the API.
  while (tail.length && tail[0]?.role === "tool") tail = tail.slice(1);

  const dropped = rest.length - head.length - tail.length;
  const notice: Message = {
    role: "user",
    content: `[${dropped} earlier message(s) trimmed to fit context. Setup and recent results preserved.]`,
  };
  return [...system, ...head, notice, ...tail];
}

export type Summarizer = (messages: Message[]) => Promise<string>;

/**
 * Like trimMessages, but replaces the dropped middle with an LLM summary
 * instead of a bare notice. Falls back to trimMessages if summarize throws.
 */
export async function compressMessages(
  messages: Message[],
  contextWindow: number,
  summarize: Summarizer,
  opts: TrimOptions = {},
): Promise<Message[]> {
  const protectFirst = opts.protectFirst ?? 3;
  const protectLast = opts.protectLast ?? 6;
  const threshold = (opts.thresholdPct ?? 75) / 100;

  if (estimateTokens(messages) <= contextWindow * threshold) return messages;

  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  if (rest.length <= protectFirst + protectLast) return messages;

  const head = rest.slice(0, protectFirst);
  let tail = rest.slice(-protectLast);
  // A leading tool result with no preceding assistant tool_call breaks the API.
  while (tail.length && tail[0]?.role === "tool") tail = tail.slice(1);
  const middle = rest.slice(protectFirst, rest.length - tail.length);

  try {
    const summary = await summarize(middle);
    const note: Message = {
      role: "user",
      content: `[Summary of ${middle.length} earlier messages]: ${summary}`,
    };
    // CC-COMPACTION-REMIND: a transient nudge to /compress, injected interior so
    // it never displaces head/goalNote at index 1 (pinned by tests).
    const reminder = compactionReminder(estimateTokens(messages), contextWindow);
    const reminderNote: Message[] = reminder ? [{ role: "user" as const, content: reminder }] : [];
    const compressed = [...system, ...head, note, ...reminderNote, ...tail];
    if (!opts.activeGoalText) return compressed;
    const goalNote: Message = { role: "user", content: `[Active goal — keep this in focus]: ${opts.activeGoalText}` };
    return [...system, goalNote, ...compressed.slice(system.length)];
  } catch {
    return trimMessages(messages, contextWindow, opts);
  }
}

export type CompactResult = { messages: Message[]; compacted: boolean; dropped: number; summary: string };

/**
 * PERSISTENT compaction. Unlike compressMessages (which returns a transient
 * per-call copy with goal/reminder injections), this returns the compacted BASE
 * — system + protected head + one summary note + protected tail, NO transient
 * injections — so the caller can REPLACE the stored conversation and actually
 * shrink it. Returns compacted=false (with the originals) when under threshold,
 * too short to compact, or the summarizer throws.
 */
export async function compactConversation(
  messages: Message[],
  contextWindow: number,
  summarize: Summarizer,
  opts: TrimOptions = {},
): Promise<CompactResult> {
  const protectFirst = opts.protectFirst ?? 3;
  const protectLast = opts.protectLast ?? 6;
  const threshold = (opts.thresholdPct ?? 75) / 100;
  const none: CompactResult = { messages, compacted: false, dropped: 0, summary: "" };
  if (contextWindow <= 0 || estimateTokens(messages) <= contextWindow * threshold) return none;

  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  if (rest.length <= protectFirst + protectLast) return none;

  const head = rest.slice(0, protectFirst);
  let tail = rest.slice(-protectLast);
  while (tail.length && tail[0]?.role === "tool") tail = tail.slice(1); // never lead the tail with an orphan tool result
  const middle = rest.slice(protectFirst, rest.length - tail.length);
  if (middle.length === 0) return none;

  try {
    const summary = await summarize(middle);
    const note: Message = { role: "user", content: `[Summary of ${middle.length} earlier messages]: ${summary}` };
    return { messages: [...system, ...head, note, ...tail], compacted: true, dropped: middle.length, summary };
  } catch {
    return none;
  }
}
