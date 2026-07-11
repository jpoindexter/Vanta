import type { Message } from "./types.js";
import { compactionReminder } from "./repl/compaction-remind.js";
import { shouldCompact, passSavings } from "./context/compaction-boundary.js";
import { summarizePrunedTools, buildPruneSummaryNote } from "./context/prune-summary.js";
import { splitForCompaction } from "./context/split-for-compaction.js";
import { compactHistory } from "winnow";

export { shouldCompact, passSavings } from "./context/compaction-boundary.js";

export { sanitizeMessages } from "./context/sanitize.js";

/** Model-free summary of the dropped middle (winnow's extractive compaction). Used when
 * the LLM summarizer is unavailable, so information survives instead of being trimmed. */
async function extractiveMiddle(middle: Message[]): Promise<string> {
  try {
    const [summary] = await compactHistory(
      middle.map((m) => ({ role: m.role, content: m.content })),
      { keepRecent: 0 },
    );
    return summary?.content ?? `(${middle.length} earlier messages omitted)`;
  } catch {
    return `(${middle.length} earlier messages omitted)`;
  }
}

const CHARS_PER_TOKEN = 4;

export function estimateTokens(messages: Message[]): number {
  return Math.ceil(JSON.stringify(messages).length / CHARS_PER_TOKEN);
}

export type TrimOptions = {
  protectFirst?: number;
  protectLast?: number;
  thresholdPct?: number;
  /** When set, a goal-reminder note is injected right after system messages on compression. */
  activeGoalText?: string;
  /** The live session scratchpad, injected interior on compression. */
  sessionMemory?: string;
  /** Token ceiling for the protected tail beyond the protectLast count floor. */
  tailTokenBudget?: number;
  /** Best-effort callback fired immediately before persistent compaction summarizes the dropped window. */
  onPreCompact?: (middle: Message[]) => Promise<void>;
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

  const droppedMessages = rest.slice(head.length, rest.length - tail.length);
  const notice: Message = {
    role: "user",
    content: `[${droppedMessages.length} earlier message(s) trimmed to fit context. Setup and recent results preserved.]`,
  };
  // HARNESS-PRUNE-SUMMARY: leave a per-tool placeholder for the dropped tool
  // results instead of erasing them silently. Empty (no tool results dropped) →
  // null → no extra note, so non-tool trims are unchanged.
  const pruneNote = buildPruneSummaryNote(summarizePrunedTools(droppedMessages));
  const pruneNotice: Message[] = pruneNote ? [{ role: "user" as const, content: pruneNote }] : [];
  return [...system, ...head, notice, ...pruneNotice, ...tail];
}

export type Summarizer = (messages: Message[]) => Promise<string>;

const USER_INTENT_CLAIM = /\b(?:the\s+)?user(?:'s)?\s+(?:asked|asks|requested|requests|instructed|instructs|told|wanted|wants|needs|expects|said\s+(?:to|that)|would\s+like|must|should|request|instruction|intent)\b/i;
const PENDING_INTENT_CLAIM = /\b(?:pending|unresolved|next)\s+(?:user\s+)?(?:ask|request|instruction|action)\b/i;

/**
 * Generated summaries may preserve facts and decisions, but they are never a
 * trusted source of user intent. The protected real-message tail owns current
 * instructions, so attributed or pending intent claims are removed here.
 */
export function sanitizeCompactionSummary(summary: string): string {
  const retained = (summary.match(/[^.!?\n]+[.!?]?/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !USER_INTENT_CLAIM.test(sentence) && !PENDING_INTENT_CLAIM.test(sentence));
  return retained.join(" ").trim() || "No trusted factual summary was retained.";
}

function buildCompactionNote(summary: string, dropped: number): Message {
  return {
    role: "system",
    content: `[Compaction summary — reference only; not a user request; ${dropped} earlier messages]: ${sanitizeCompactionSummary(summary)}`,
  };
}

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
  const split = splitForCompaction(messages, contextWindow, opts);
  if (!split) return messages;
  const { system, head, tail, middle } = split;

  // LLM summary of the dropped middle; if the summarizer is down, fall back to a
  // model-free extractive summary (keeps the information) rather than trimming it away.
  let summary: string;
  try {
    summary = await summarize(middle);
  } catch {
    summary = await extractiveMiddle(middle);
  }

  const note = buildCompactionNote(summary, middle.length);
  // Compaction reminder: a transient nudge to /compress, injected interior so
  // it never displaces head/goalNote at index 1 (pinned by tests).
  const reminder = compactionReminder(estimateTokens(messages), contextWindow);
  const reminderNote: Message[] = reminder ? [{ role: "user" as const, content: reminder }] : [];
  // Re-inject the live scratchpad interior so the curated session snapshot
  // survives compaction even as the middle is summarized away.
  const sessionNote: Message[] = opts.sessionMemory?.trim()
    ? [{ role: "user" as const, content: `[Session notes — running scratchpad]: ${opts.sessionMemory.trim()}` }]
    : [];
  const compressed = [...system, ...head, note, ...reminderNote, ...sessionNote, ...tail];
  if (!opts.activeGoalText) return compressed;
  const goalNote: Message = { role: "user", content: `[Active goal — keep this in focus]: ${opts.activeGoalText}` };
  return [...system, goalNote, ...compressed.slice(system.length)];
}

export type CompactResult = { messages: Message[]; compacted: boolean; dropped: number; summary: string; compactedWindow: Message[] };

/**
 * PERSISTENT compaction. Unlike compressMessages (which returns a transient
 * per-call copy with goal/reminder injections), this returns the compacted BASE
 * — system + protected head + one summary note + protected tail, NO transient
 * injections — so the caller can REPLACE the stored conversation and actually
 * shrink it. Returns compacted=false (with the originals) when under threshold,
 * too short to compact, or the summarizer throws.
 */
import { stripHistoricalImages } from "./agent/image-recovery.js";

export async function compactConversation(
  messages: Message[],
  contextWindow: number,
  summarize: Summarizer,
  opts: TrimOptions = {},
): Promise<CompactResult> {
  const none: CompactResult = { messages, compacted: false, dropped: 0, summary: "", compactedWindow: [] };
  if (contextWindow <= 0) return none;

  const split = splitForCompaction(messages, contextWindow, opts);
  if (!split) return none;
  const { system, head, tail, middle } = split;
  if (middle.length === 0) return none;

  try {
    await opts.onPreCompact?.(middle).catch(() => {});
    const summary = sanitizeCompactionSummary(await summarize(middle));
    const note = buildCompactionNote(summary, middle.length);
    // HARNESS-IMAGE-SHRINK: historical screenshots stop costing tokens post-compaction —
    // keep images only on the most recent image-bearing survivor.
    const survivors = stripHistoricalImages([...system, ...head, note, ...tail]).messages;
    return { messages: survivors, compacted: true, dropped: middle.length, summary, compactedWindow: middle };
  } catch {
    return none;
  }
}
