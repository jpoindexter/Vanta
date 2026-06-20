import { listDefs, loadDef, loadState, saveState, saveDef } from "../loop/store.js";
import { raiseEscalation, hasOpenEscalations } from "../loop/state.js";
import type { LoopDef, LoopState } from "../loop/types.js";

// Liveness watchdog: a silently-stalled loop is one whose run started but never
// completed within a threshold (inProgress with an old runStartedAt) — a crash or
// hang that nothing else surfaces. The watchdog detects these on a tick and
// surfaces each by raising an escalation (which pauses the loop), so a stuck run
// stops spinning and shows up for the operator instead of dying in silence.

export type WatchdogConfig = { stallMinutes: number };
export type StallReport = { loopId: string; stalledForMin: number; reason: string };
export type WatchdogResult = { reports: StallReport[]; surfaced: number };

export function resolveWatchdogConfig(env: NodeJS.ProcessEnv): WatchdogConfig {
  const n = Number(env.VANTA_WATCHDOG_STALL_MIN);
  return { stallMinutes: Number.isFinite(n) && n > 0 ? n : 30 };
}

/** A loop is silently stalled if a run is in progress past the threshold. Pure. */
export function detectStall(def: LoopDef, state: LoopState, now: Date, stallMinutes: number): StallReport | null {
  if (!state.inProgress || !state.runStartedAt) return null;
  const stalledForMin = (now.getTime() - new Date(state.runStartedAt).getTime()) / 60_000;
  if (stalledForMin < stallMinutes) return null;
  return {
    loopId: def.id,
    stalledForMin,
    reason: `run in progress for ${stalledForMin.toFixed(0)}m with no completion (≥ ${stallMinutes}m)`,
  };
}

/** Scan every registered loop and report the silently-stalled ones. */
export async function checkLiveness(dataDir: string, now: Date, config: WatchdogConfig): Promise<StallReport[]> {
  const reports: StallReport[] = [];
  for (const def of await listDefs(dataDir)) {
    const stall = detectStall(def, await loadState(dataDir, def.id), now, config.stallMinutes);
    if (stall) reports.push(stall);
  }
  return reports;
}

/**
 * Surface stalls durably: raise a watchdog escalation (which pauses the loop) so
 * a silently-stuck run stops spinning and shows up via `vanta loop escalations`.
 * Idempotent — a loop already carrying an open escalation is left alone. Returns
 * the count newly surfaced.
 */
export async function surfaceStalls(dataDir: string, reports: StallReport[], now: Date): Promise<number> {
  let surfaced = 0;
  for (const r of reports) {
    const state = await loadState(dataDir, r.loopId);
    if (hasOpenEscalations(state)) continue;
    await saveState(dataDir, raiseEscalation(state, `watchdog: ${r.reason}`, now));
    const def = await loadDef(dataDir, r.loopId);
    if (def && def.status === "active") await saveDef(dataDir, { ...def, status: "paused" });
    surfaced += 1;
  }
  return surfaced;
}

export async function runWatchdog(dataDir: string, now: Date, config: WatchdogConfig): Promise<WatchdogResult> {
  const reports = await checkLiveness(dataDir, now, config);
  const surfaced = await surfaceStalls(dataDir, reports, now);
  return { reports, surfaced };
}
