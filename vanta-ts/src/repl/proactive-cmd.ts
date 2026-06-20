import { resolveProactiveConfig, decideProactiveTick, type ProactiveConfig, type ProactiveState, type TickDecision } from "../proactive/policy.js";
import { loadProactiveState } from "../proactive/store.js";
import { peekLoopWakeCount } from "../loop/wake.js";
import { getBudget } from "../budget/store.js";
import { isExceeded } from "../budget/types.js";
import type { ReplCtx, SlashResult, SlashHandler } from "./types.js";

// `/proactive` — surface the proactive-autonomy mode (KAIROS). Read-only: it
// shows whether proactive ticking is enabled and the current throttle/state,
// points to how to enable it, and to the recurring-task scheduler (/loop). The
// status format is pure; the handler injects its loaders so it never mutates.

/** Loaders the handler injects so the format stays pure and the test uses fakes. */
export type ProactiveStatusDeps = {
  resolveConfig: (env: NodeJS.ProcessEnv) => ProactiveConfig;
  loadState: (dataDir: string) => Promise<ProactiveState>;
  queuedCount: (dataDir: string) => Promise<number>;
  budgetExceeded: (dataDir: string, scope: string) => Promise<boolean>;
};

const liveDeps: ProactiveStatusDeps = {
  resolveConfig: resolveProactiveConfig,
  loadState: loadProactiveState,
  queuedCount: peekLoopWakeCount,
  budgetExceeded: async (dataDir, scope) => {
    const b = await getBudget(dataDir, scope);
    return b ? isExceeded(b) : false;
  },
};

/**
 * Human-facing proactive status. Pure: every input is passed in (the handler
 * resolves config/state/decision via injected loaders). Read-only — never
 * mutates. `decision` carries "would it tick now" from `decideProactiveTick`.
 */
export function formatProactiveStatus(config: ProactiveConfig, state: ProactiveState, env: NodeJS.ProcessEnv, decision: TickDecision): string {
  const lines: string[] = [];
  lines.push(`  proactive autonomy (KAIROS): ${config.enabled ? "enabled" : "disabled"}`);
  if (config.enabled) {
    lines.push(`  would tick now: ${decision.tick ? "yes" : `no (${decision.reason})`}`);
  } else {
    lines.push("  enable with VANTA_PROACTIVE=1 (then VANTA_PROACTIVE_IDLE_MIN / _INTERVAL_MIN / _MAX_PER_DAY tune the throttle)");
  }
  lines.push(`  throttle: idle ≥ ${config.minIdleMin}m · interval ≥ ${config.minIntervalMin}m · ≤ ${config.maxPerDay}/day · budget scope "${config.budgetScope}"`);
  lines.push(`  state: last tick ${state.lastTickAt ?? "never"} · ${state.ticksToday} tick(s) today`);
  lines.push("  schedule recurring tasks with /loop <interval> <task> (the proactive heartbeat advances queued loop wakes when idle)");
  return lines.join("\n");
}

/** /proactive — read-only status of the proactive-autonomy mode (KAIROS). */
export function makeProactive(deps: ProactiveStatusDeps = liveDeps): SlashHandler {
  return async (_arg: string, ctx: ReplCtx): Promise<SlashResult> => {
    const config = deps.resolveConfig(ctx.env);
    const state = await deps.loadState(ctx.dataDir);
    const decision = decideProactiveTick({
      config,
      state,
      now: ctx.now(),
      queuedCount: await deps.queuedCount(ctx.dataDir),
      budgetExceeded: await deps.budgetExceeded(ctx.dataDir, config.budgetScope),
    });
    return { output: formatProactiveStatus(config, state, ctx.env, decision) };
  };
}

export const proactive: SlashHandler = makeProactive();
