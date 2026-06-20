import { setTimeout as sleep } from "node:timers/promises";
import { runDueTasks } from "../schedule/runner.js";
import { isDue, loadCron } from "../schedule/cron.js";
import { tickLoops } from "./loops-tick.js";
import type { RunTask } from "../schedule/runner.js";
import type { CronEntry } from "../schedule/cron.js";
import type { PlatformAdapter, InboundMessage } from "./platforms/base.js";
import { spawnLoopChild, spawnFactoryChild, pollPlatform, startWebhookIfConfigured } from "./child-ops.js";
import type { WebhookServer, Deliver } from "./webhook.js";
import {
  classifyInbound,
  initialState,
  markFinished,
  routeInbound,
  takeNext,
  type SessionState,
} from "./session-manager.js";
import { drainLoopWakes } from "../loop/wake.js";
import { runWatchdog, resolveWatchdogConfig } from "../liveness/watchdog.js";
import type { WakeContext } from "../loop/types.js";
import { loadDef } from "../loop/store.js";

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
  spawnLoop?: (id: string, wake: WakeContext) => void;
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

async function fireQueuedWakes(
  deps: Pick<GatewayDeps, "dataDir">,
  spawnLoop: (id: string, wake: WakeContext) => void,
  log: (msg: string) => void,
): Promise<number> {
  const queuedWakes = await drainLoopWakes(deps.dataDir).catch(() => []);
  let fired = 0;
  for (const wake of queuedWakes) {
    const def = await loadDef(deps.dataDir, wake.goal_id);
    if (!def || def.status !== "active") {
      log(`loop ${wake.goal_id}: wake ${wake.wake_reason} skipped (not active)`);
      continue;
    }
    spawnLoop(wake.goal_id, wake);
    log(`loop ${wake.goal_id}: wake ${wake.wake_reason} → spawned`);
    fired++;
  }
  return fired;
}

export async function gatewayTick(deps: GatewayDeps): Promise<number> {
  const now = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? ((m: string) => console.log(m));
  const spawnLoop = deps.spawnLoop ?? ((id: string, wake: WakeContext) => spawnLoopChild(id, log, wake));
  const queuedWakes = await fireQueuedWakes(deps, spawnLoop, log);
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
  const loopsFired = await tickLoops({
    dataDir: deps.dataDir,
    now,
    spawn: spawnLoop,
    log,
  });
  // Liveness watchdog: surface silently-stalled loops within this tick.
  const watch = await runWatchdog(deps.dataDir, now, resolveWatchdogConfig(process.env)).catch(() => null);
  if (watch && watch.surfaced > 0) log(`watchdog: surfaced ${watch.surfaced} stalled loop(s)`);
  return queuedWakes + results.length + factoryEntries.length + loopsFired;
}

async function sleepInterval(tickMs: number, stillRunning: () => boolean): Promise<void> {
  for (let waited = 0; stillRunning() && waited < tickMs; waited += 1000) {
    await sleep(Math.min(1000, tickMs - waited));
  }
}

type SessionRun = {
  platform: PlatformAdapter;
  handle: (text: string) => Promise<string>;
  log: (msg: string) => void;
};

/** Run one inbound message to completion and send the reply (errors → reply). */
async function runOne(ctx: SessionRun, m: InboundMessage): Promise<void> {
  ctx.log(`  ✉ ${ctx.platform.id} ${m.from ?? m.chatId}: ${firstLine(m.text)}`);
  let reply: string;
  try { reply = await ctx.handle(m.text); }
  catch (err) { reply = `error: ${err instanceof Error ? err.message : String(err)}`; }
  await ctx.platform.send({ chatId: m.chatId, text: reply });
}

/** Drain the FIFO queue once the current run is finished. */
async function drainQueue(ctx: SessionRun, state: SessionState): Promise<SessionState> {
  let s = markFinished(state);
  for (let next = takeNext(s); next.msg; next = takeNext(s)) {
    await runOne(ctx, next.msg);
    s = next.state;
    s = markFinished(s);
  }
  return s;
}

/**
 * Poll the platform and route a *concurrent* inbound batch through the session
 * manager: the first message runs now; any further message in the same batch is
 * routed by its leading command (interrupt/steer/queue — default queue), then
 * queued messages drain FIFO after the current run. interrupt/steer can't abort
 * the opaque in-flight `handle()`, so they are surfaced as the next run, not a
 * faked mid-run abort (see report). Returns the next state + messages handled.
 */
async function pollPlatformSession(
  deps: GatewayDeps,
  state: SessionState,
): Promise<{ state: SessionState; count: number }> {
  if (!deps.platform || !deps.handle) {
    return { state, count: await pollPlatform(deps) };
  }
  const ctx: SessionRun = { platform: deps.platform, handle: deps.handle, log: deps.log ?? ((m) => console.log(m)) };
  const messages = await deps.platform.poll();
  let s = state;
  for (const m of messages) {
    const routed = routeInbound(s, m);
    s = routed.state;
    if (routed.action === "run-now") await runOne(ctx, m);
    else if (routed.action === "queue") ctx.log(`  ⏳ queued (busy): ${firstLine(m.text)}`);
    else ctx.log(`  ⤳ ${routed.action} (${classifyInbound(m.text)}): ${firstLine(m.text)}`);
  }
  if (s.running) s = await drainQueue(ctx, s);
  return { state: s, count: messages.length };
}

export { pollPlatformSession };

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
  let session: SessionState = initialState();
  while (running) {
    try {
      await gatewayTick(deps);
      session = (await pollPlatformSession(deps, session)).state;
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
