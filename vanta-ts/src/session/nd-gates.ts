import { runEfGates } from "../nd/engine.js";
import { applySensoryLoad, applyTimeSupport } from "../nd/gates.js";
import { getNdProfileCached, ndEngineEnabled } from "../nd/profile.js";
import { extractLastTurnToolNames } from "../repl/research-gate.js";
import { readVelocityEvents, velocityStats } from "../velocity/store.js";
import type { EfSignals, EfState, NdPreferences } from "../nd/types.js";
import type { Message } from "../types.js";
import type { KernelClient } from "../kernel/client.js";

// Wires the ND executive-function engine into the post-turn rail. Builds the
// per-turn signal snapshot from the transcript + goal + velocity + timing, runs
// the user's enabled gates, and surfaces each nudge as a note. Best-effort: any
// failure returns the prior state unchanged (never breaks a turn).

const WRITE_TOOLS = new Set(["write_file", "edit_file"]);
const COMMIT_TOOLS = new Set(["git_commit"]);
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function lastUserMessage(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "user") return m.content;
  }
  return "";
}

function lastAssistantProducedText(messages: Message[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "assistant") return Boolean(m.content && m.content.trim());
  }
  return false;
}

export type NdGateInputs = {
  messages: Message[];
  safety: KernelClient;
  turnIndex: number;
  startedMs: number;
  now: number;
  onNote: (text: string) => void;
  env?: NodeJS.ProcessEnv;
};

async function buildSignals(o: NdGateInputs, env: NodeJS.ProcessEnv): Promise<EfSignals> {
  const toolNames = extractLastTurnToolNames(o.messages);
  const goals = await o.safety.getGoals().catch(() => []);
  const activeGoal = goals.find((g) => g.status === "active") ?? null;
  const vel = velocityStats(await readVelocityEvents(env).catch(() => []), SEVEN_DAYS_MS, new Date(o.now));
  return {
    turnIndex: o.turnIndex,
    lastUserMessage: lastUserMessage(o.messages),
    toolNames,
    producedText: lastAssistantProducedText(o.messages),
    wroteFiles: toolNames.some((n) => WRITE_TOOLS.has(n)),
    committed: toolNames.some((n) => COMMIT_TOOLS.has(n)),
    activeGoalText: activeGoal?.text ?? null,
    elapsedMin: Math.max(0, (o.now - o.startedMs) / 60_000),
    captures: vel.captures,
    ships: vel.ships,
  };
}

/**
 * Scale a gate nudge by the user's non-gate ND preferences (PURE): time-support
 * first (may suppress the time nudge → ""), then sensory-load decoration. The
 * DEFAULT profile (medium/ranges) returns the nudge unchanged.
 */
export function decorateNudge(nudge: string, prefs: NdPreferences): string {
  const timed = applyTimeSupport(nudge, prefs.timeSupport);
  return timed ? applySensoryLoad(timed, prefs.sensoryLoad) : "";
}

/** Run the ND EF gates for the just-completed turn. Returns the advanced state. */
export async function ndGatesAfterTurn(state: EfState, o: NdGateInputs): Promise<EfState> {
  const env = o.env ?? process.env;
  if (!ndEngineEnabled(env)) return state;
  try {
    const { gates: config, prefs } = await getNdProfileCached(env);
    const signals = await buildSignals(o, env);
    const { state: next, nudges } = runEfGates(signals, state, config);
    for (const nudge of nudges) {
      const decorated = decorateNudge(nudge, prefs);
      if (decorated) o.onNote(decorated);
    }
    return next;
  } catch {
    return state;
  }
}
