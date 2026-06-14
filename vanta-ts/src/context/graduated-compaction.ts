import type { Message } from "../types.js";
import { compressMessages, estimateTokens, trimMessages, type Summarizer } from "../context.js";
import { clearStaleToolResults } from "./time-microcompact.js";

// PAPER-GRADUATED-COMPACTION: ordered, cheapest-first shaping for a single
// model call. It never mutates the base transcript, so the full history remains
// reconstructable from the stored conversation even when the call payload is
// aggressively shaped.

const TOOL_RESULT_LIMIT = 2_000;
const MESSAGE_LIMIT = 4_000;
const TOOL_KEEP_RECENT = 4;

export type CompactionLayer = "budget-reduction" | "snip" | "microcompact" | "context-collapse" | "trim";

export type GraduatedCompactionResult = {
  messages: Message[];
  layers: CompactionLayer[];
  beforeTokens: number;
  afterTokens: number;
};

type Options = {
  contextWindow: number;
  thresholdPct?: number;
  summarize?: Summarizer;
  activeGoalText?: string;
  sessionMemory?: string;
};

function overBudget(messages: Message[], opts: Options): boolean {
  const threshold = (opts.thresholdPct ?? 75) / 100;
  return opts.contextWindow > 0 && estimateTokens(messages) > opts.contextWindow * threshold;
}

function limitText(text: string, limit: number, label: string): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n[${label}: ${text.length - limit} chars omitted from call payload; full transcript retained]`;
}

function reduceToolPayloads(messages: Message[]): Message[] {
  return messages.map((m) => m.role === "tool" ? { ...m, content: limitText(m.content, TOOL_RESULT_LIMIT, "tool result snipped") } : m);
}

function snipLongMessages(messages: Message[]): Message[] {
  return messages.map((m) => m.role !== "system" ? { ...m, content: limitText(m.content, MESSAGE_LIMIT, "message snipped") } : m);
}

async function collapseContext(messages: Message[], opts: Options): Promise<Message[]> {
  if (!opts.summarize) return messages;
  return compressMessages(messages, opts.contextWindow, opts.summarize, {
    activeGoalText: opts.activeGoalText,
    sessionMemory: opts.sessionMemory,
    thresholdPct: opts.thresholdPct,
  });
}

async function applyLayer(
  messages: Message[],
  layer: CompactionLayer,
  opts: Options,
): Promise<Message[]> {
  if (layer === "budget-reduction") return reduceToolPayloads(messages);
  if (layer === "snip") return snipLongMessages(messages);
  if (layer === "microcompact") return clearStaleToolResults(messages, Number.POSITIVE_INFINITY, { keepRecent: TOOL_KEEP_RECENT });
  if (layer === "context-collapse") return collapseContext(messages, opts);
  return trimMessages(messages, opts.contextWindow, { thresholdPct: opts.thresholdPct });
}

/** Apply cheap→costly shapers until the call payload fits, or all layers are exhausted. */
export async function graduatedCompaction(messages: Message[], opts: Options): Promise<GraduatedCompactionResult> {
  const beforeTokens = estimateTokens(messages);
  let shaped = messages;
  const layers: CompactionLayer[] = [];
  for (const layer of ["budget-reduction", "snip", "microcompact", "context-collapse", "trim"] as const) {
    if (!overBudget(shaped, opts)) break;
    const next = await applyLayer(shaped, layer, opts);
    if (next !== shaped || estimateTokens(next) < estimateTokens(shaped)) layers.push(layer);
    shaped = next;
  }
  return { messages: shaped, layers, beforeTokens, afterTokens: estimateTokens(shaped) };
}
