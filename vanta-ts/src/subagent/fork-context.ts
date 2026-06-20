import type { Message } from "../types.js";

// VANTA-FORK-SUBAGENT — pure resolution of a subagent's starting seed.
//
// When a subagent is spawned WITHOUT an explicit type (a "fork"), it should
// INHERIT a compact slice of the parent's context instead of starting from a
// fresh scoped goal. When a type IS given, behavior is unchanged: the worker
// gets only its scoped instruction (current behavior, no preamble).
//
// Everything here is pure and deterministic — no I/O, no LLM, no clock. The
// live spawn flow (subagent/spawn.ts) and the delegate tool (tools/delegate.ts)
// are unchanged this round; the call points are named in WIRING below.
//
// WIRING (where the live flow would call this, NOT done this round):
//   tools/delegate.ts runDelegate: when `subagent_type`/agentType is omitted or
//     "fork", pass the parent's recent `messages` + system prompt through
//     `resolveSubagentSeed` and hand the returned seed to `spawnSubagent` as the
//     `instruction`. With an explicit type, pass `scopedInstruction` unchanged
//     (isForkSpawn(agentType) === false → seed === scopedInstruction).
//   subagent/spawn.ts runWorker: would accept the resolved seed as the worker's
//     first user message (convo.send(seed)) rather than the raw instruction.

/** How many recent parent turns the fork preamble may carry. Kept small so the
 *  inherited context never blows the worker's window. */
export const DEFAULT_FORK_CONTEXT_TURNS = 6;

/** Per-turn character cap inside the preamble — each line is a gist, not a dump. */
const TURN_CHAR_CAP = 200;

const FORK_TYPE = "fork";

/**
 * A spawn is a "fork" (inherit parent context) when no concrete type is named:
 * undefined, empty/whitespace, or the literal "fork" (case-insensitive).
 * Any other value is a real scoped agent type → current scoped behavior.
 */
export function isForkSpawn(agentType?: string): boolean {
  const t = (agentType ?? "").trim().toLowerCase();
  return t === "" || t === FORK_TYPE;
}

/** Only user/assistant text carries conversational context worth inheriting.
 *  System prompts are rebuilt per worker; tool results are noise + can leak. */
function isInheritableTurn(m: Message): m is Extract<Message, { role: "user" | "assistant" }> {
  return m.role === "user" || m.role === "assistant";
}

/** Reduce one turn to a single labeled gist line, capped so nothing dumps. */
function gistTurn(m: Extract<Message, { role: "user" | "assistant" }>): string | null {
  const text = m.content.trim().replace(/\s+/g, " ");
  if (!text) return null;
  const label = m.role === "user" ? "User" : "Assistant";
  const body = text.length > TURN_CHAR_CAP ? `${text.slice(0, TURN_CHAR_CAP - 1)}…` : text;
  return `${label}: ${body}`;
}

/**
 * Build a COMPACT inherited-context preamble from the parent's recent turns.
 * Caps to the last `max` inheritable (user/assistant) turns, gists each, and
 * frames the block as a forked continuation. Returns "" when there is nothing
 * to inherit (so callers can fall back to the bare instruction).
 */
export function buildForkPreamble(parentMessages?: Message[], max: number = DEFAULT_FORK_CONTEXT_TURNS): string {
  const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : DEFAULT_FORK_CONTEXT_TURNS;
  const turns = (parentMessages ?? []).filter(isInheritableTurn);
  const recent = turns.slice(-cap);
  const lines = recent.map(gistTurn).filter((l): l is string => l !== null);
  if (lines.length === 0) return "";
  return [
    "[Forked continuation — you inherit the parent agent's recent context.]",
    `Recent conversation (last ${lines.length} turn${lines.length === 1 ? "" : "s"}):`,
    ...lines,
  ].join("\n");
}

/** Inputs for resolving the worker's starting seed. */
export type SubagentSeedOpts = {
  /** The named subagent type, if any. Omitted/empty/"fork" → inherit context. */
  agentType?: string;
  /** The parent's recent messages — only used in fork mode. */
  parentMessages?: Message[];
  /** The parent's system prompt — reserved for richer fork seeds; not dumped. */
  parentSystemPrompt?: string;
  /** The scoped instruction for the worker (always present, always last). */
  scopedInstruction: string;
};

/**
 * Resolve the seed a worker starts from.
 * - Fork (no/empty/"fork" type): an inherited-context preamble (a compact slice
 *   of the parent) followed by the scoped instruction. Empty parent → just the
 *   instruction.
 * - Typed: the scoped instruction only (current behavior, unchanged).
 */
export function resolveSubagentSeed(opts: SubagentSeedOpts): string {
  const instruction = opts.scopedInstruction;
  if (!isForkSpawn(opts.agentType)) return instruction;
  const preamble = buildForkPreamble(opts.parentMessages);
  return preamble ? `${preamble}\n\n${instruction}` : instruction;
}
