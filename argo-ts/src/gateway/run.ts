import { setTimeout as sleep } from "node:timers/promises";
import { runDueTasks } from "../schedule/runner.js";
import type { RunTask } from "../schedule/runner.js";
import type { CronEntry } from "../schedule/cron.js";

// The gateway daemon: a long-lived process that ticks the cron scheduler on an
// interval, so scheduled tasks fire without an external OS trigger. `argo
// gateway` runs it in the foreground; the launchd service (service/) keeps it
// alive in the background. This is the keystone for unattended operation.

const DEFAULT_TICK_MS = 60_000;

export type GatewayDeps = {
  dataDir: string;
  run: RunTask;
  tickMs?: number;
  now?: () => Date;
  log?: (msg: string) => void;
  /** Cron loader, injected only for tests; defaults to the on-disk loader. */
  load?: (dataDir: string) => Promise<CronEntry[]>;
};

function firstLine(text: string): string {
  const line = text.split("\n")[0] ?? "";
  return line.length > 100 ? `${line.slice(0, 97)}...` : line;
}

/**
 * Run every cron task due at this instant. Returns the number that ran. Pulled
 * out of the loop so it's testable without spinning the daemon.
 */
export async function gatewayTick(deps: GatewayDeps): Promise<number> {
  const now = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? ((m: string) => console.log(m));
  const results = await runDueTasks({
    dataDir: deps.dataDir,
    now,
    run: deps.run,
    load: deps.load,
  });
  for (const r of results) log(`  ↳ #${r.id} ${firstLine(r.result)}`);
  return results.length;
}

/**
 * Foreground daemon loop: tick, then sleep one interval, until SIGINT/SIGTERM.
 * The sleep polls the stop flag each second so Ctrl+C exits within ~1s. A tick
 * that throws is logged and the loop continues — one bad task never kills the
 * daemon.
 */
export async function runGateway(deps: GatewayDeps): Promise<void> {
  const tickMs = deps.tickMs ?? DEFAULT_TICK_MS;
  const log = deps.log ?? ((m: string) => console.log(m));

  let running = true;
  const stop = (): void => {
    running = false;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  log(`argo gateway: ticking every ${Math.round(tickMs / 1000)}s — Ctrl+C to stop.`);
  while (running) {
    try {
      await gatewayTick(deps);
    } catch (err) {
      log(`argo gateway: tick error — ${err instanceof Error ? err.message : String(err)}`);
    }
    for (let waited = 0; running && waited < tickMs; waited += 1000) {
      await sleep(Math.min(1000, tickMs - waited));
    }
  }
  log("argo gateway: stopped.");
}
