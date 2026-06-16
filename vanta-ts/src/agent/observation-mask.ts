import type { Message } from "../types.js";

// HARNESS-OBSERVATION-MASKING (Pachaar §4, Junie strategy): hide stale tool
// OUTPUTS while keeping tool CALLS. The agent keeps seeing "I called X with
// these args" but not the full output from old calls — cheaply reducing context
// volume before heavier graduated compaction runs.
//
// "Stale" = any tool result beyond the most recent KEEP_RECENT results. The
// placeholder records the original char count so the agent is never silently
// surprised that detail was removed.

const DEFAULT_KEEP_RECENT = 6;
const MASK_PLACEHOLDER = (chars: number) => `[output masked — ${chars} chars]`;

export type ObservationMaskOpts = {
  keepRecent?: number;
  placeholder?: (chars: number) => string;
};

/** Env-driven config: returns undefined (disabled) or the number of recent results to keep. */
export function resolveObservationMaskKeep(env: NodeJS.ProcessEnv): number | undefined {
  const v = env.VANTA_OBSERVATION_MASKING?.trim().toLowerCase();
  if (!v || v === "0" || v === "false") return undefined;
  const parsed = parseInt(v, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_KEEP_RECENT;
}

/**
 * Return a new message list where tool OUTPUTS older than the most recent
 * `keepRecent` results are replaced with a short placeholder. Tool CALLS
 * (assistant messages with toolCalls) are untouched. Pure — never mutates.
 */
export function maskStaleToolOutputs(messages: Message[], opts: ObservationMaskOpts = {}): Message[] {
  const keepRecent = opts.keepRecent ?? DEFAULT_KEEP_RECENT;
  const ph = opts.placeholder ?? MASK_PLACEHOLDER;
  const toolIndices = messages
    .map((m, i) => (m.role === "tool" ? i : -1))
    .filter((i) => i !== -1);
  const keepSet = new Set(toolIndices.slice(-keepRecent));
  return messages.map((m, i) => {
    if (m.role !== "tool" || keepSet.has(i)) return m;
    return { ...m, content: ph(m.content.length) };
  });
}
