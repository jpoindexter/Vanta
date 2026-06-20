import { dataDirFor } from "./ops.js";
import { resolveWatchdogConfig, checkLiveness, runWatchdog } from "../liveness/watchdog.js";

// `vanta watchdog` — liveness check over registered loops. `check` reports
// silently-stalled loops; `run` also surfaces them (escalate + pause). Designed
// to be cron/gateway-invoked so stalls are caught within one tick.

export async function runWatchdogCommand(repoRoot: string, rest: string[]): Promise<number> {
  const dataDir = dataDirFor(repoRoot);
  const config = resolveWatchdogConfig(process.env);
  const now = new Date();
  const sub = rest[0] ?? "check";

  if (sub === "check") {
    const reports = await checkLiveness(dataDir, now, config);
    if (reports.length === 0) {
      console.log(`watchdog: all loops healthy (stall threshold ${config.stallMinutes}m)`);
      return 0;
    }
    console.log(`watchdog: ${reports.length} stalled loop(s):`);
    for (const r of reports) console.log(`  ✘ ${r.loopId} — ${r.reason}`);
    return 0;
  }

  if (sub === "run") {
    const { reports, surfaced } = await runWatchdog(dataDir, now, config);
    console.log(
      reports.length === 0
        ? `watchdog: all loops healthy (stall threshold ${config.stallMinutes}m)`
        : `watchdog: ${reports.length} stalled loop(s); ${surfaced} newly surfaced (escalated + paused)`,
    );
    return 0;
  }

  console.error("usage: vanta watchdog [check|run]");
  return 1;
}
