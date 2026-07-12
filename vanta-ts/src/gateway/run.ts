import { setTimeout as sleep } from "node:timers/promises";
import {
  runDueTasksTracked,
  loadLastFired,
  saveLastFired,
} from "../schedule/runner.js";
import { isDue, loadCron } from "../schedule/cron.js";
import { fireWindowKey } from "../schedule/at-most-once.js";
import { claimFire, sweepClaims } from "../schedule/cron-cas.js";
import { runCronScript } from "../schedule/script-run.js";
import { createRoutineIssue } from "../schedule/commands.js";
import { tickLoops } from "./loops-tick.js";
import type { RunTask } from "../schedule/runner.js";
import type { CronEntry } from "../schedule/cron.js";
import type { PlatformAdapter } from "./platforms/base.js";
import type { MediaBridgeDeps } from "./media.js";
import type { ProgressBubbleConfig } from "./progress-bubble.js";
import { spawnLoopChild, spawnFactoryChild, startWebhookIfConfigured } from "./child-ops.js";
import type { WebhookServer, Deliver } from "./webhook.js";
import { initialState, type SessionState } from "./session-manager.js";
import { newSeenIds, type SeenIds } from "./inbound.js";
import { pollPlatformSession } from "./run-session.js";
import {
  changedHealth,
  formatHealthTransition,
  type ChannelHealth,
} from "./platforms/channel-supervisor.js";
import { drainLoopWakes } from "../loop/wake.js";
import { withCaffeinate, resolveCaffeinate } from "../power/caffeinate.js";
import { runWatchdog, resolveWatchdogConfig } from "../liveness/watchdog.js";
import { maybeAutoTune } from "../meta-tune/auto-tune.js";
import type { WakeContext } from "../loop/types.js";
import { loadDef } from "../loop/store.js";
import type { GatewayHandle } from "./stream-events.js";
import { startPlatformWebhookServer, type PlatformWebhookServer } from "./platform-webhook.js";
import { runDailySentinels, type SentinelRunDeps } from "../goals/sentinel.js";
import { listWorkflows } from "../webhook-workflows/store.js";
import { startWorkflowWebhookServer, type WorkflowWebhookServer } from "../webhook-workflows/runtime.js";
import type { ContextRefScope } from "../context/ref-preprocess.js";
import type { ExpandDeps } from "../context/ref-expand.js";

const DEFAULT_TICK_MS = 60_000;

export type GatewayDeps = {
  dataDir: string;
  run: RunTask;
  tickMs?: number;
  now?: () => Date;
  log?: (msg: string) => void;
  load?: (dataDir: string) => Promise<CronEntry[]>;
  platform?: PlatformAdapter;
  handle?: GatewayHandle;
  media?: MediaBridgeDeps; // MSG-MEDIA-IMAGES: inbound image→vision, voice→STT
  progressBubble?: ProgressBubbleConfig;
  spawnLoop?: (id: string, wake: WakeContext) => void;
  webhook?: {
    port: number;
    secret?: string;
    prompt: (body: string) => string;
    deliver: Deliver;
  };
  workflowWebhooks?: {
    port: number;
    resolveDeliver: (target: string) => Deliver;
  };
  home?: string;
  /** Push-channel webhook listener. Defaults to loopback:3978 when a configured adapter exposes handlers. */
  platformWebhookPort?: number;
  platformWebhookHost?: string;
  /** Injectable only so tests do not emit real operator notifications. */
  sentinelNotify?: SentinelRunDeps["notify"];
  /** CHANNEL-PERMISSIONS-WIRE: pending-approval reply bus — an inbound message
   * referencing a pending request id is consumed as an approval reply instead
   * of becoming an agent turn. Absent → behavior unchanged. */
  replyBus?: { tryConsume(msg: { chatId: string; text: string }): boolean; drainBypassed(): unknown[] };
  /** Inbound-pipeline config: the bot's @-handle + optional group-gating + tz label. */
  inbound?: {
    /** Bot @-handle (no leading @) for mention-gating + strip; absent → no group gate. */
    handle?: string;
    /** Group chat ids that require a mention; empty/absent → all groups require it. */
    requireMentionIn?: Set<string>;
    /** Human-readable timezone label appended to the inbound timestamp (e.g. "CEST"). */
    zone?: string;
  };
  /** Surface-neutral @reference expansion under the message's project/profile scope. */
  contextRefs?: {
    resolveScope: (message: import("./platforms/base.js").InboundMessage) => Promise<ContextRefScope> | ContextRefScope;
    deps?: ExpandDeps;
  };
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
  const { factoryEntries, regularEntries } = await dueTaskGroups(deps, now);
  for (const _entry of factoryEntries) {
    spawnFactoryChild(deps.dataDir, log);
  }
  // At-most-once: overlapping gateway ticks within the same minute fire each
  // due task once; the next minute is a new window and fires.
  const lastFired = await loadLastFired(deps.dataDir);
  const { results, lastFired: updatedFired } = await runDueTasksTracked({
    dataDir: deps.dataDir,
    now,
    run: deps.run,
    load: async () => regularEntries,
    lastFired,
    claim: (id, windowKey) => claimFire(deps.dataDir, id, windowKey),
    runScript: (script) => runCronScript(script),
    createIssue: (title) => createRoutineIssue(deps.dataDir, title),
  });
  await saveLastFired(deps.dataDir, updatedFired);
  await sweepClaims(deps.dataDir, fireWindowKey(now));
  for (const r of results) log(`  ↳ #${r.id} ${firstLine(r.result)}`);
  const sentinelResults = await runDailySentinels(deps.dataDir, now, {
    notify: deps.sentinelNotify,
  });
  for (const result of sentinelResults) {
    log(`sentinel ${result.status === "pass" ? "pass" : "wake"} ${result.sentinel.id}: ${firstLine(result.output)}`);
  }
  const loopsFired = await tickLoops({
    dataDir: deps.dataDir,
    now,
    spawn: spawnLoop,
    log,
  });
  // Liveness watchdog: surface silently-stalled loops within this tick.
  const watch = await runWatchdog(deps.dataDir, now, resolveWatchdogConfig(process.env)).catch(() => null);
  if (watch && watch.surfaced > 0) log(`watchdog: surfaced ${watch.surfaced} stalled loop(s)`);
  // PERSONAL-MODEL-TUNE: auto-train a LoRA when enough preference data accrued
  // (no-op unless VANTA_LORA_AUTO=1; best-effort, never breaks the tick).
  await maybeAutoTune(deps.dataDir, log);
  return queuedWakes + results.length + factoryEntries.length + sentinelResults.length + loopsFired;
}

async function dueTaskGroups(deps: GatewayDeps, now: Date): Promise<{ factoryEntries: CronEntry[]; regularEntries: CronEntry[] }> {
  const allEntries = deps.load ? await deps.load(deps.dataDir) : await loadCron(deps.dataDir);
  const dueEntries = allEntries.filter((entry) => entry.status === "active" && isDue(entry.cron, now));
  return {
    factoryEntries: dueEntries.filter((entry) => entry.instruction.startsWith("__factory__")),
    regularEntries: dueEntries.filter((entry) => !entry.instruction.startsWith("__factory__")),
  };
}

async function sleepInterval(tickMs: number, stillRunning: () => boolean): Promise<void> {
  for (let waited = 0; stillRunning() && waited < tickMs; waited += 1000) {
    await sleep(Math.min(1000, tickMs - waited));
  }
}

export { pollPlatformSession };

/** GATEWAY-CHANNEL-SELFHEAL — read a composite platform's per-channel health, if any. */
function readChannelHealth(platform: PlatformAdapter | undefined): ChannelHealth[] {
  const p = platform as { health?: () => ChannelHealth[] } | undefined;
  return p?.health ? p.health() : [];
}

/** Log any channel that changed up/down since the last tick; return the new snapshot. */
function logChannelHealth(
  platform: PlatformAdapter | undefined,
  prev: ChannelHealth[],
  log: (msg: string) => void,
): ChannelHealth[] {
  const curr = readChannelHealth(platform);
  for (const h of changedHealth(prev, curr)) log(`vanta gateway: ${formatHealthTransition(h)}`);
  return curr;
}

type GatewayLoopArgs = {
  deps: GatewayDeps;
  tickMs: number;
  log: (msg: string) => void;
  isRunning: () => boolean;
};

/** Start the push-channel ingress owned by the configured adapter, if any. */
export async function startMessagingWebhook(
  deps: Pick<GatewayDeps, "platform" | "platformWebhookPort" | "platformWebhookHost">,
  log: (message: string) => void,
): Promise<PlatformWebhookServer | undefined> {
  const handlers = deps.platform?.webhookHandlers?.() ?? [];
  if (handlers.length === 0) return undefined;
  const envPort = Number(process.env.VANTA_MESSAGING_WEBHOOK_PORT);
  return startPlatformWebhookServer({
    port: deps.platformWebhookPort ?? (Number.isFinite(envPort) && envPort > 0 ? envPort : 3978),
    host: deps.platformWebhookHost ?? process.env.VANTA_MESSAGING_WEBHOOK_HOST,
    handlers,
    log,
  }).catch((error: unknown) => {
    log(`vanta gateway: messaging webhook listener failed — ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  });
}

/** Start persisted, multi-route workflow webhooks when at least one is enabled. */
export async function startWorkflowWebhooks(
  deps: Pick<GatewayDeps, "dataDir" | "handle" | "workflowWebhooks">,
  log: (message: string) => void,
): Promise<WorkflowWebhookServer | undefined> {
  if (!deps.handle || !deps.workflowWebhooks) return undefined;
  const workflows = await listWorkflows(deps.dataDir);
  if (!workflows.some((workflow) => workflow.enabled)) return undefined;
  return startWorkflowWebhookServer({
    port: deps.workflowWebhooks.port,
    dataDir: deps.dataDir,
    handle: deps.handle,
    resolveDeliver: deps.workflowWebhooks.resolveDeliver,
    log,
  }).catch((error: unknown) => {
    log(`vanta gateway: workflow webhook listener failed — ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  });
}

/** The gateway's tick→poll→sleep loop, run for as long as `isRunning()`. */
async function runGatewayLoop(args: GatewayLoopArgs): Promise<void> {
  const { deps, tickMs, log, isRunning } = args;
  let session: SessionState = initialState();
  let seen: SeenIds = newSeenIds();
  let health: ChannelHealth[] = [];
  while (isRunning()) {
    try {
      await gatewayTick(deps);
      const polled = await pollPlatformSession(deps, session, seen);
      session = polled.state;
      seen = polled.seen;
      health = logChannelHealth(deps.platform, health, log);
    } catch (err) {
      log(`vanta gateway: tick error — ${err instanceof Error ? err.message : String(err)}`);
    }
    await sleepInterval(tickMs, isRunning);
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
  const workflowWebhookServer = await startWorkflowWebhooks(deps, log);
  const platformWebhookServer = await startMessagingWebhook(deps, log);
  log(
    `vanta gateway: ticking every ${Math.round(tickMs / 1000)}s` +
      (deps.platform ? ` · ${deps.platform.id} gateway live` : "") +
      " — Ctrl+C to stop.",
  );
  // VANTA-PREVENT-SLEEP: the gateway is a long-running operation; keep macOS
  // awake for its lifetime when opted in (off by default / no-op off-macOS).
  await withCaffeinate(
    () => runGatewayLoop({ deps, tickMs, log, isRunning: () => running }),
    { enabled: resolveCaffeinate(process.env) },
  );
  if (deps.platform) await deps.platform.disconnect().catch(() => {});
  if (webhookServer) await webhookServer.close().catch(() => {});
  if (workflowWebhookServer) await workflowWebhookServer.close().catch(() => {});
  if (platformWebhookServer) await platformWebhookServer.close().catch(() => {});
  log("vanta gateway: stopped.");
}

export { pollPlatform } from "./child-ops.js";
