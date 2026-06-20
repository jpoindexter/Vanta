import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { runHeartbeat, pidAlive, STAGE_ORDER, type HeartbeatStage } from "./runtime.js";
import { peekLoopWakeCount, drainLoopWakes } from "../loop/wake.js";
import { getBudget } from "../budget/store.js";
import { isExceeded } from "../budget/types.js";

// `vanta heartbeat` — one wakeup of the coalesced pipeline. The stages are wired
// to real subsystems where they exist (budget gate, adapter resolution, workspace
// dir); secret/skill are best-effort presence gates (deeper injection is a later
// slice). Queued work = pending loop wakes; executing drains them.

async function budgetGate(dataDir: string): Promise<{ ok: boolean; reason?: string }> {
  const b = await getBudget(dataDir, "session").catch(() => null);
  return b && isExceeded(b) ? { ok: false, reason: "session budget exceeded" } : { ok: true };
}

async function adapterGate(): Promise<{ ok: boolean; reason?: string }> {
  try {
    const { resolveProvider } = await import("../providers/index.js");
    resolveProvider(process.env);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "no adapter configured" };
  }
}

/** The default budget→workspace→secret→skill→adapter gates, in STAGE_ORDER. */
export function buildDefaultStages(dataDir: string): HeartbeatStage[] {
  const byName: Record<(typeof STAGE_ORDER)[number], HeartbeatStage["run"]> = {
    budget: () => budgetGate(dataDir),
    workspace: async () => {
      const fs = await import("node:fs/promises");
      await fs.mkdir(dataDir, { recursive: true });
      return { ok: true };
    },
    secret: async () => ({ ok: true }),
    skill: async () => ({ ok: true }),
    adapter: () => adapterGate(),
  };
  return STAGE_ORDER.map((name) => ({ name, run: byName[name] }));
}

export async function runHeartbeatCommand(repoRoot: string): Promise<void> {
  const dataDir = join(repoRoot, ".vanta");
  const result = await runHeartbeat({
    dataDir,
    now: () => new Date(),
    pid: process.pid,
    isAlive: pidAlive,
    queuedCount: () => peekLoopWakeCount(dataDir),
    stages: buildDefaultStages(dataDir),
    execute: async () => ({ ran: (await drainLoopWakes(dataDir)).length }),
    newId: () => randomUUID(),
  });
  console.log(JSON.stringify({ heartbeat: result }, null, 2));
}
