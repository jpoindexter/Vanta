import { setTimeout as sleep } from "node:timers/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { runDueTasks } from "../schedule/runner.js";
import { isDue, loadCron } from "../schedule/cron.js";
import type { RunTask } from "../schedule/runner.js";
import type { CronEntry } from "../schedule/cron.js";
import type { PlatformAdapter } from "./platforms/base.js";
import { startWebhookServer, type Deliver, type WebhookServer } from "./webhook.js";

// The gateway daemon: a long-lived process that ticks the cron scheduler on an
// interval, so scheduled tasks fire without an external OS trigger. `vanta
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
  /** Run one inbound message as an agent turn → reply text. Required with `platform`/`webhook`. */
  handle?: (text: string) => Promise<string>;
  /** Optional inbound webhook listener; events run as agent turns and deliver. */
  webhook?: {
    port: number;
    secret?: string;
    /** Build the agent instruction from the raw request body. */
    prompt: (body: string) => string;
    deliver: Deliver;
  };
};

function firstLine(text: string): string {
  const line = text.split("\n")[0] ?? "";
  return line.length > 100 ? `${line.slice(0, 97)}...` : line;
}

/**
 * Spawn `vanta factory approve` as a detached child process for a factory cron entry.
 * A detached child ensures a multi-hour cycle never blocks the 60s gateway tick.
 * Checks the lockfile before spawning to prevent double-runs.
 */
function spawnFactoryChild(dataDir: string, log: (msg: string) => void): void {
  if (existsSync(join(dataDir, "factory.lock"))) {
    log("factory: already running (lockfile present) — skipping gateway spawn");
    return;
  }
  const child = spawn("vanta", ["factory", "approve"], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  log(`factory: spawned detached cycle (pid ${child.pid})`);
}

/**
 * Run every cron task due at this instant. Returns the number that ran. Pulled
 * out of the loop so it's testable without spinning the daemon.
 * Factory cron entries (instruction starts with `__factory__`) are spawned as
 * detached child processes rather than running inline.
 */
export async function gatewayTick(deps: GatewayDeps): Promise<number> {
  const now = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? ((m: string) => console.log(m));

  // Intercept factory entries before handing the rest to runDueTasks
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

  // S5: periodic brain heartbeat — update drives/identity region every N ticks.
  await writeHeartbeat(deps.dataDir, now).catch(() => {});

  return results.length + factoryEntries.length;
}

const HEARTBEAT_EVERY_MS = 3_600_000; // 1 hour
let lastHeartbeatMs = 0;

async function writeHeartbeat(dataDir: string, now: Date): Promise<void> {
  const ms = now.getTime();
  if (ms - lastHeartbeatMs < HEARTBEAT_EVERY_MS) return;
  lastHeartbeatMs = ms;
  const { writeRegion } = await import("../brain/store.js");
  const note = `\n- [${now.toISOString()}] gateway heartbeat — daemon alive, tasks processed`;
  await writeRegion("drives", note, { append: true });
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

  let webhookServer: WebhookServer | undefined;
  if (deps.webhook && deps.handle) {
    const { prompt, deliver } = deps.webhook;
    const handle = deps.handle;
    webhookServer = await startWebhookServer({
      port: deps.webhook.port,
      secret: deps.webhook.secret,
      log,
      onEvent: async (body) => {
        const reply = await handle(prompt(body));
        await deliver(reply);
      },
    }).catch((err: unknown) => {
      log(`vanta gateway: webhook listener failed — ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    });
  }

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
    for (let waited = 0; running && waited < tickMs; waited += 1000) {
      await sleep(Math.min(1000, tickMs - waited));
    }
  }
  if (deps.platform) await deps.platform.disconnect().catch(() => {});
  if (webhookServer) await webhookServer.close().catch(() => {});
  log("vanta gateway: stopped.");
}
