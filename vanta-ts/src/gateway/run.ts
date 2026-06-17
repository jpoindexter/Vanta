import { setTimeout as sleep } from "node:timers/promises";
import { runDueTasks } from "../schedule/runner.js";
import { isDue, loadCron } from "../schedule/cron.js";
import { tickLoops } from "./loops-tick.js";
import type { RunTask } from "../schedule/runner.js";
import type { CronEntry } from "../schedule/cron.js";
import type { PlatformAdapter } from "./platforms/base.js";
import { spawnLoopChild, spawnFactoryChild, pollPlatform, startWebhookIfConfigured } from "./child-ops.js";
import type { WebhookServer, Deliver } from "./webhook.js";

const DEFAULT_TICK_MS = 60_000;

export type GatewayDeps = {
  dataDir: string;
  run: RunTask;
  tickMs?: number;
  now?: () => Date;
  log?: (msg: string) => void;
  load?: (dataDir: string) => Promise<CronEntry[]>;
  platform?: PlatformAdapter;
  handle?: (text: string) => Promise<string>;
  webhook?: {
    port: number;
    secret?: string;
    prompt: (body: string) => string;
    deliver: Deliver;
  };
  home?: string;
};

function firstLine(text: string): string {
  const line = text.split("\n")[0] ?? "";
  return line.length > 100 ? `${line.slice(0, 97)}...` : line;
}

export async function gatewayTick(deps: GatewayDeps): Promise<number> {
  const now = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? ((m: string) => console.log(m));
  const allEntries = deps.load ? await deps.load(deps.dataDir) : await loadCron(deps.dataDir);
  const dueEntries = allEntries.filter((e) => e.status === "active" && isDue(e.cron, now));
  const factoryEntries = dueEntries.filter((e) => e.instruction.startsWith("__factory__"));
  const regularEntries = dueEntries.filter((e) => !e.instruction.startsWith("__factory__"));
  for (const _entry of factoryEntries) {
    spawnFactoryChild(deps.dataDir, log);
  }
  const results = await runDueTasks({
    dataDir: deps.dataDir,
    now,
    run: deps.run,
    load: async () => regularEntries,
  });
  for (const r of results) log(`  ↳ #${r.id} ${firstLine(r.result)}`);
  await writeHeartbeat(deps.dataDir, now).catch(() => {});
  const loopsFired = await tickLoops({
    dataDir: deps.dataDir,
    now,
    spawn: (id) => spawnLoopChild(id, log),
    log,
  });
  return results.length + factoryEntries.length + loopsFired;
}

const HEARTBEAT_EVERY_MS = 3_600_000;
let lastHeartbeatMs = 0;

async function writeHeartbeat(dataDir: string, now: Date): Promise<void> {
  const ms = now.getTime();
  if (ms - lastHeartbeatMs < HEARTBEAT_EVERY_MS) return;
  lastHeartbeatMs = ms;
  const { resolveBrain } = await import("../brain/interface.js");
  const note = `\n- [${now.toISOString()}] gateway heartbeat — daemon alive, tasks processed`;
  await resolveBrain().write("drives", note, { append: true });
}

async function sleepInterval(tickMs: number, stillRunning: () => boolean): Promise<void> {
  for (let waited = 0; stillRunning() && waited < tickMs; waited += 1000) {
    await sleep(Math.min(1000, tickMs - waited));
  }
}

export async function runGateway(deps: GatewayDeps): Promise<void> {
  const tickMs = deps.tickMs ?? DEFAULT_TICK_MS;
  const log = deps.log ?? ((m: string) => console.log(m));
  let running = true;
  const stop = (): void => { running = false; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  if (deps.platform) await deps.platform.connect().catch(() => {});
  const webhookServer: WebhookServer | undefined = await startWebhookIfConfigured(deps.webhook, deps.handle, log);
  log(
    `vanta gateway: ticking every ${Math.round(tickMs / 1000)}s` +
      (deps.platform ? ` · ${deps.platform.id} gateway live` : "") +
      " — Ctrl+C to stop.",
  );
  while (running) {
    try {
      await gatewayTick(deps);
      await pollPlatform(deps);
    } catch (err) {
      log(`vanta gateway: tick error — ${err instanceof Error ? err.message : String(err)}`);
    }
    await sleepInterval(tickMs, () => running);
  }
  if (deps.platform) await deps.platform.disconnect().catch(() => {});
  if (webhookServer) await webhookServer.close().catch(() => {});
  log("vanta gateway: stopped.");
}

export { pollPlatform } from "./child-ops.js";
