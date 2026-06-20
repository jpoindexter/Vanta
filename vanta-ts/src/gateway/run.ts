import { setTimeout as sleep } from "node:timers/promises";
import { runDueTasks } from "../schedule/runner.js";
import { isDue, loadCron } from "../schedule/cron.js";
import { tickLoops } from "./loops-tick.js";
import type { RunTask } from "../schedule/runner.js";
import type { CronEntry } from "../schedule/cron.js";
import type { PlatformAdapter, InboundMessage, OutboundMessage } from "./platforms/base.js";
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
import { isIntentionalSilence } from "./response-filter.js";
import {
  processInbound,
  newSeenIds,
  type InboundContext,
  type SeenIds,
} from "./inbound.js";
import { recordSent, nodeReplyFs, type ReplyStoreDeps } from "./reply-store.js";
import { drainLoopWakes } from "../loop/wake.js";
import { withCaffeinate, resolveCaffeinate } from "../power/caffeinate.js";
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
  /** Inbound-pipeline config: the bot's @-handle + optional group-gating + tz label. */
  inbound?: {
    /** Bot @-handle (no leading @) for mention-gating + strip; absent → no group gate. */
    handle?: string;
    /** Group chat ids that require a mention; empty/absent → all groups require it. */
    requireMentionIn?: Set<string>;
    /** Human-readable timezone label appended to the inbound timestamp (e.g. "CEST"). */
    zone?: string;
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
  /** Reply-context store deps; absent → sent replies aren't recorded. */
  reply?: ReplyStoreDeps;
};

/**
 * Wire point 2 (record-on-send): after the reply is sent, persist its
 * `messageId → text` into the reply-context store so a later inbound reply can
 * quote it. Best-effort; an id-less outbound is skipped.
 */
async function recordReply(ctx: SessionRun, out: OutboundMessage): Promise<void> {
  if (!ctx.reply || !out.id) return;
  await recordSent(ctx.reply, out.id, out.text);
}

/** Run one inbound message to completion and send the reply (errors → reply). */
async function runOne(ctx: SessionRun, m: InboundMessage): Promise<void> {
  ctx.log(`  ✉ ${ctx.platform.id} ${m.from ?? m.chatId}: ${firstLine(m.text)}`);
  // The agent sees the LLM-enriched rendering (timestamp + quote) when the
  // inbound pipeline produced one; otherwise the raw text (unchanged behavior).
  const forAgent = m.llmText ?? m.text;
  let reply: string;
  try { reply = await ctx.handle(forAgent); }
  catch (err) { reply = `error: ${err instanceof Error ? err.message : String(err)}`; }
  // MSG-NO-REPLY-TOKEN: an exact whole-response silence marker suppresses delivery
  // (group/channel surfaces); prose mentioning the marker still sends.
  if (isIntentionalSilence(reply)) { ctx.log(`  🤫 silence (${reply.trim()}): no reply sent`); return; }
  const out: OutboundMessage = { chatId: m.chatId, text: reply };
  await ctx.platform.send(out);
  await recordReply(ctx, out);
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

/** Reply-context store deps for a gateway run (kernel data dir + Node fs). */
function replyStoreDeps(deps: GatewayDeps): ReplyStoreDeps {
  return { fs: nodeReplyFs(), dir: deps.dataDir };
}

/** Build the inbound-pipeline context (mention config + clock + reply store). */
function inboundContext(deps: GatewayDeps, seen: SeenIds): InboundContext {
  return {
    seen,
    mention: { handle: deps.inbound?.handle ?? "", requireMentionIn: deps.inbound?.requireMentionIn },
    now: deps.now ?? (() => new Date()),
    zone: deps.inbound?.zone,
    reply: replyStoreDeps(deps),
  };
}

/**
 * Poll the platform and route a *concurrent* inbound batch through the session
 * manager: the first message runs now; any further message in the same batch is
 * routed by its leading command (interrupt/steer/queue — default queue), then
 * queued messages drain FIFO after the current run. interrupt/steer can't abort
 * the opaque in-flight `handle()`, so they are surfaced as the next run, not a
 * faked mid-run abort (see report). Returns the next state + messages handled.
 *
 * Wire point 1 (gate-on-receive): every inbound message first passes through
 * `processInbound` (dedup → require-mention(+strip) → timestamp → reply-context).
 * A "skip" verdict drops the message before routing (no agent turn); a "handle"
 * verdict yields the enriched message that routing/`runOne` then sees. The
 * bounded seen-id set is threaded across ticks via the returned `seen`.
 */
async function pollPlatformSession(
  deps: GatewayDeps,
  state: SessionState,
  seenIn?: SeenIds,
): Promise<{ state: SessionState; count: number; seen: SeenIds }> {
  let seen = seenIn ?? newSeenIds();
  if (!deps.platform || !deps.handle) {
    return { state, count: await pollPlatform(deps), seen };
  }
  const log = deps.log ?? ((m: string) => console.log(m));
  const ctx: SessionRun = { platform: deps.platform, handle: deps.handle, log, reply: replyStoreDeps(deps) };
  const messages = await deps.platform.poll();
  let s = state;
  let handled = 0;
  for (const m of messages) {
    const processed = await processInbound(m, inboundContext(deps, seen));
    seen = processed.seen;
    if (processed.verdict.kind === "skip") {
      log(`  ⤬ skip (${processed.verdict.reason}): ${firstLine(m.text)}`);
      continue;
    }
    const enriched = processed.verdict.message;
    handled++;
    const routed = routeInbound(s, enriched);
    s = routed.state;
    if (routed.action === "run-now") await runOne(ctx, enriched);
    else if (routed.action === "queue") ctx.log(`  ⏳ queued (busy): ${firstLine(enriched.text)}`);
    else ctx.log(`  ⤳ ${routed.action} (${classifyInbound(enriched.text)}): ${firstLine(enriched.text)}`);
  }
  if (s.running) s = await drainQueue(ctx, s);
  return { state: s, count: handled, seen };
}

export { pollPlatformSession };

type GatewayLoopArgs = {
  deps: GatewayDeps;
  tickMs: number;
  log: (msg: string) => void;
  isRunning: () => boolean;
};

/** The gateway's tick→poll→sleep loop, run for as long as `isRunning()`. */
async function runGatewayLoop(args: GatewayLoopArgs): Promise<void> {
  const { deps, tickMs, log, isRunning } = args;
  let session: SessionState = initialState();
  let seen: SeenIds = newSeenIds();
  while (isRunning()) {
    try {
      await gatewayTick(deps);
      const polled = await pollPlatformSession(deps, session, seen);
      session = polled.state;
      seen = polled.seen;
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
  log("vanta gateway: stopped.");
}

export { pollPlatform } from "./child-ops.js";
