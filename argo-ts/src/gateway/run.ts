import { setTimeout as sleep } from "node:timers/promises";
import { runDueTasks } from "../schedule/runner.js";
import type { RunTask } from "../schedule/runner.js";
import type { CronEntry } from "../schedule/cron.js";
import type { PlatformAdapter } from "./platforms/base.js";

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
  /** Optional messaging gateway (Telegram, etc.) polled each tick. */
  platform?: PlatformAdapter;
  /** Run one inbound message as an agent turn → reply text. Required with `platform`. */
  handle?: (text: string) => Promise<string>;
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
 * Poll the configured messaging platform once: for each inbound message, run an
 * agent turn and send the reply. Returns the number of messages handled. A
 * handler error becomes the reply text (the user always hears back). No-op when
 * no platform/handle is wired.
 */
export async function pollPlatform(deps: GatewayDeps): Promise<number> {
  if (!deps.platform || !deps.handle) return 0;
  const log = deps.log ?? ((m: string) => console.log(m));
  const messages = await deps.platform.poll();
  for (const m of messages) {
    log(`  ✉ ${deps.platform.id} ${m.from ?? m.chatId}: ${firstLine(m.text)}`);
    let reply: string;
    try {
      reply = await deps.handle(m.text);
    } catch (err) {
      reply = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
    await deps.platform.send({ chatId: m.chatId, text: reply });
  }
  return messages.length;
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

  if (deps.platform) await deps.platform.connect().catch(() => {});
  log(
    `argo gateway: ticking every ${Math.round(tickMs / 1000)}s` +
      (deps.platform ? ` · ${deps.platform.id} gateway live` : "") +
      " — Ctrl+C to stop.",
  );
  while (running) {
    try {
      await gatewayTick(deps);
      await pollPlatform(deps);
    } catch (err) {
      log(`argo gateway: tick error — ${err instanceof Error ? err.message : String(err)}`);
    }
    for (let waited = 0; running && waited < tickMs; waited += 1000) {
      await sleep(Math.min(1000, tickMs - waited));
    }
  }
  if (deps.platform) await deps.platform.disconnect().catch(() => {});
  log("argo gateway: stopped.");
}
