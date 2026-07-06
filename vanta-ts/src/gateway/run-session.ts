import type { PlatformAdapter, InboundMessage, OutboundMessage } from "./platforms/base.js";
import type { ImageAttachment } from "../types.js";
import { resolveInbound, type MediaBridgeDeps } from "./media.js";
import {
  classifyInbound,
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
import { pollPlatform } from "./child-ops.js";
import type { GatewayDeps } from "./run.js";

function firstLine(text: string): string {
  const line = text.split("\n")[0] ?? "";
  return line.length > 100 ? `${line.slice(0, 97)}...` : line;
}

type SessionRun = {
  platform: PlatformAdapter;
  handle: (text: string, images?: ImageAttachment[]) => Promise<string>;
  media?: MediaBridgeDeps;
  log: (msg: string) => void;
  /** Reply-context store deps; absent → sent replies aren't recorded. */
  reply?: ReplyStoreDeps;
};

// Wire point 2 (record-on-send): persist the sent reply's id→text for later
// reply-context quoting (best-effort; an id-less outbound is skipped).
async function recordReply(ctx: SessionRun, out: OutboundMessage): Promise<void> {
  if (!ctx.reply || !out.id) return;
  await recordSent(ctx.reply, out.id, out.text);
}

/** Run one inbound message to completion and send the reply (errors → reply). */
async function runOne(ctx: SessionRun, m: InboundMessage): Promise<void> {
  ctx.log(`  ✉ ${ctx.platform.id} ${m.from ?? m.chatId}: ${firstLine(m.text)}`);
  // The agent sees the LLM-enriched rendering (timestamp + quote) when the
  // inbound pipeline produced one; otherwise the raw text (unchanged behavior).
  const { forAgent, images } = await resolveInbound(m, ctx.media ?? {}); // MSG-MEDIA-IMAGES
  let reply: string;
  try { reply = await ctx.handle(forAgent, images); }
  catch (err) { reply = `error: ${err instanceof Error ? err.message : String(err)}`; }
  // MSG-NO-REPLY-TOKEN: an exact whole-response silence marker suppresses delivery
  // (group/channel surfaces); prose mentioning the marker still sends.
  if (isIntentionalSilence(reply)) { ctx.log(`  🤫 silence (${reply.trim()}): no reply sent`); return; }
  // MSG-TELEGRAM-ROBUST: a forum-topic inbound routes the reply back to its topic.
  const out: OutboundMessage = { chatId: m.chatId, threadId: m.threadId, text: reply };
  await ctx.platform.send(out);
  await recordReply(ctx, out);
}

/** Route one enriched inbound message: run now, queue, or surface the command. */
async function routeOne(ctx: SessionRun, s: SessionState, enriched: InboundMessage): Promise<SessionState> {
  const routed = routeInbound(s, enriched);
  if (routed.action === "run-now") await runOne(ctx, enriched);
  else if (routed.action === "queue") ctx.log(`  ⏳ queued (busy): ${firstLine(enriched.text)}`);
  else ctx.log(`  ⤳ ${routed.action} (${classifyInbound(enriched.text)}): ${firstLine(enriched.text)}`);
  return routed.state;
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
  const ctx: SessionRun = { platform: deps.platform, handle: deps.handle, media: deps.media, log, reply: replyStoreDeps(deps) };
  // CHANNEL-PERMISSIONS-WIRE: messages the approval pump polled (and parked)
  // while a turn was blocked come first — none are lost to the pump.
  const parked = (deps.replyBus?.drainBypassed() ?? []) as InboundMessage[];
  const messages = [...parked, ...await deps.platform.poll()];
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
    // CHANNEL-PERMISSIONS-WIRE: a reply to a pending approval is consumed here —
    // it resolves the relay race and must not become an agent turn.
    if (deps.replyBus?.tryConsume(enriched)) {
      log(`  ✓ approval reply consumed: ${firstLine(enriched.text)}`);
      continue;
    }
    handled++;
    s = await routeOne(ctx, s, enriched);
  }
  if (s.running) s = await drainQueue(ctx, s);
  return { state: s, count: handled, seen };
}

export { pollPlatformSession };
