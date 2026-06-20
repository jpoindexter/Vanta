import { decideProactiveTick, recordTick, type ProactiveConfig, type TickDecision } from "./policy.js";
import { loadProactiveState, saveProactiveState } from "./store.js";

// The proactive-tick orchestrator: load state → decide under the throttle → if
// allowed, run ONE batch of queued work and record the tick. The queue count,
// budget verdict, and the actual work runner are injected so this stays testable
// without a kernel, a provider, or real loops.

export type ProactiveTickResult = TickDecision & { ran: number };

export type ProactiveTickArgs = {
  dataDir: string;
  now: Date;
  config: ProactiveConfig;
  /** Number of items currently queued (e.g. pending loop wakes). */
  queuedCount: number;
  /** True when the throttle's budget scope is already exhausted. */
  budgetExceeded: boolean;
  /** Process the queued work; returns how many items it ran. */
  runBatch: () => Promise<number>;
};

export async function runProactiveTick(args: ProactiveTickArgs): Promise<ProactiveTickResult> {
  const state = await loadProactiveState(args.dataDir);
  const decision = decideProactiveTick({
    config: args.config,
    state,
    now: args.now,
    queuedCount: args.queuedCount,
    budgetExceeded: args.budgetExceeded,
  });
  if (!decision.tick) return { ...decision, ran: 0 };
  const ran = await args.runBatch();
  await saveProactiveState(args.dataDir, recordTick(state, args.now));
  return { ...decision, ran };
}
