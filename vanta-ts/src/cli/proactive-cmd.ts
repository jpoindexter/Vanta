import { dataDirFor, buildCronRunTask } from "./ops.js";
import { resolveProactiveConfig, decideProactiveTick } from "../proactive/policy.js";
import { loadProactiveState } from "../proactive/store.js";
import { runProactiveTick } from "../proactive/tick.js";
import { peekLoopWakeCount, drainLoopWakes } from "../loop/wake.js";
import { loadDef } from "../loop/store.js";
import { getBudget } from "../budget/store.js";
import { isExceeded } from "../budget/types.js";

// `vanta proactive` — KAIROS heartbeat. `status` shows the throttle + whether it
// would tick now; `run` fires one throttled pickup of queued loop wakes. Designed
// to be cron-invoked: an idle, user-away host advances queued loops on its own,
// gated by idle-time + cadence + the budget hard-stop.

async function budgetExceededFor(dataDir: string, scope: string): Promise<boolean> {
  const b = await getBudget(dataDir, scope);
  return b ? isExceeded(b) : false;
}

/** Run each queued loop wake whose loop is still active (mirrors the gateway). */
async function fireQueuedWakes(repoRoot: string, dataDir: string, log: (m: string) => void): Promise<number> {
  const wakes = await drainLoopWakes(dataDir);
  const runTask = buildCronRunTask(repoRoot);
  let ran = 0;
  for (const wake of wakes) {
    const def = await loadDef(dataDir, wake.goal_id);
    if (!def || def.status !== "active") { log(`skip ${wake.goal_id} (not active)`); continue; }
    await runTask(`Proactively advance loop ${def.id}: ${def.goal}`, wake);
    ran += 1;
  }
  return ran;
}

export async function runProactiveCommand(repoRoot: string, rest: string[]): Promise<number> {
  const dataDir = dataDirFor(repoRoot);
  const config = resolveProactiveConfig(process.env);
  const sub = rest[0] ?? "status";

  if (sub === "status") {
    const decision = decideProactiveTick({
      config,
      state: await loadProactiveState(dataDir),
      now: new Date(),
      queuedCount: await peekLoopWakeCount(dataDir),
      budgetExceeded: await budgetExceededFor(dataDir, config.budgetScope),
    });
    console.log(`proactive: ${config.enabled ? "enabled" : "disabled"} · would tick now: ${decision.tick ? "yes" : `no (${decision.reason})`}`);
    console.log(`  throttle: idle≥${config.minIdleMin}m · interval≥${config.minIntervalMin}m · ≤${config.maxPerDay}/day · budget scope "${config.budgetScope}"`);
    return 0;
  }

  if (sub === "run") {
    const log = (m: string): void => console.log(`  ${m}`);
    const result = await runProactiveTick({
      dataDir,
      now: new Date(),
      config,
      queuedCount: await peekLoopWakeCount(dataDir),
      budgetExceeded: await budgetExceededFor(dataDir, config.budgetScope),
      runBatch: () => fireQueuedWakes(repoRoot, dataDir, log),
    });
    console.log(result.tick ? `proactive tick: fired ${result.ran} queued wake(s)` : `proactive tick skipped: ${result.reason}`);
    return 0;
  }

  console.error("usage: vanta proactive [status|run]");
  return 1;
}
