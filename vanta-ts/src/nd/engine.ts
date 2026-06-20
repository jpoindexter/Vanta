import { GATES } from "./gates.js";
import {
  EMPTY_MEMORY,
  type EfSignals,
  type EfState,
  type GateId,
  type NdConfig,
  type NdPreferences,
  type NdProfile,
} from "./types.js";

// The one ND engine. Runs each ENABLED gate over the turn signals, threading its
// accumulator, and returns the nudges to surface. Pure — no I/O, no throws.

/** Default per-user config: each gate's built-in enabled flag + threshold. */
export function defaultNdConfig(): NdConfig {
  const cfg = {} as NdConfig;
  for (const g of GATES) cfg[g.id] = { enabled: g.defaultEnabled, threshold: g.defaultThreshold };
  return cfg;
}

/** Default non-gate preferences for a brand-new user: balanced, medium noise, ranges. */
export function defaultNdPreferences(): NdPreferences {
  return { outputDensity: "balanced", sensoryLoad: "medium", timeSupport: "ranges" };
}

/** Default whole profile: default gates + default preferences. */
export function defaultNdProfile(): NdProfile {
  return { gates: defaultNdConfig(), prefs: defaultNdPreferences() };
}

/** Set one preference key (returns a new prefs object). */
export function setNdPreference<K extends keyof NdPreferences>(
  prefs: NdPreferences,
  key: K,
  value: NdPreferences[K],
): NdPreferences {
  return { ...prefs, [key]: value };
}

/** Fresh engine state: an empty accumulator per gate. */
export function emptyEfState(): EfState {
  const st = {} as EfState;
  for (const g of GATES) st[g.id] = { ...EMPTY_MEMORY };
  return st;
}

/**
 * Run all enabled gates for one completed turn. Returns the advanced state and
 * any nudges (in gate-declaration order). A gate throwing is swallowed so one
 * bad rule never breaks the turn.
 */
export function runEfGates(
  signals: EfSignals,
  state: EfState,
  config: NdConfig,
): { state: EfState; nudges: string[] } {
  const nextState: EfState = { ...state };
  const nudges: string[] = [];
  for (const gate of GATES) {
    const gc = config[gate.id];
    if (!gc?.enabled) continue;
    const prev = state[gate.id] ?? { ...EMPTY_MEMORY };
    try {
      const { next, nudge } = gate.evaluate(signals, prev, gc.threshold);
      nextState[gate.id] = next;
      if (nudge) nudges.push(nudge);
    } catch {
      nextState[gate.id] = prev; // best-effort — never break the turn on a gate
    }
  }
  return { state: nextState, nudges };
}

/** Toggle a gate on/off in a config (returns a new config). */
export function setGateEnabled(config: NdConfig, id: GateId, enabled: boolean): NdConfig {
  return { ...config, [id]: { ...config[id], enabled } };
}

/** Set a gate's threshold (returns a new config). */
export function setGateThreshold(config: NdConfig, id: GateId, threshold: number): NdConfig {
  return { ...config, [id]: { ...config[id], threshold } };
}
