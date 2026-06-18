import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loopsDir } from "./store.js";
import { WakeContextSchema } from "./types.js";
import type { LoopDef, LoopState, WakeContext } from "./types.js";

const WAKE_QUEUE = "wake-events.jsonl";
const ENV_KEY = "VANTA_LOOP_WAKE_CONTEXT";

export function formatWakeContext(ctx: WakeContext): string {
  const lines = [
    "Wake context:",
    JSON.stringify({
      wake_reason: ctx.wake_reason,
      goal_id: ctx.goal_id,
      approval_id: ctx.approval_id,
      since: ctx.since,
    }),
  ];
  if (ctx.delta.length > 0) {
    lines.push("Delta since last wake:", ...ctx.delta.map((d) => `- ${d}`));
  }
  return lines.join("\n");
}

export function withWakeContext(text: string, ctx: WakeContext | null | undefined): string {
  return ctx ? `${formatWakeContext(ctx)}\n\n${text}` : text;
}

export function wakeContextFromLoop(
  def: LoopDef,
  state: LoopState,
  now: Date,
  reasonOverride?: string,
): WakeContext {
  const reason = reasonOverride ?? (def.trigger.kind === "cron"
    ? `cron:${def.trigger.expr}`
    : def.trigger.kind === "heartbeat"
      ? `heartbeat:${def.trigger.everyTicks}`
      : def.trigger.kind);
  return WakeContextSchema.parse({
    wake_reason: reason,
    goal_id: def.id,
    since: state.lastRunAt,
    delta: loopDelta(state, now),
  });
}

export function wakeContextForEscalationClear(
  id: string,
  state: LoopState,
  escId: string,
): WakeContext {
  const match = state.escalations.find((e) => e.id === escId);
  return WakeContextSchema.parse({
    wake_reason: "approval.resolved",
    goal_id: id,
    approval_id: escId,
    since: state.lastRunAt,
    delta: [`cleared ${escId}${match ? `: ${match.reason}` : ""}`],
  });
}

export function wakeContextForCron(entry: { id: number; cron: string }, now: Date): WakeContext {
  return WakeContextSchema.parse({
    wake_reason: `cron:${entry.cron}`,
    goal_id: `cron:${entry.id}`,
    since: null,
    delta: [`scheduled_at=${now.toISOString()}`],
  });
}

export function wakeContextForWebhook(body: string): WakeContext {
  return WakeContextSchema.parse({
    wake_reason: "webhook",
    goal_id: "webhook",
    since: null,
    delta: [`body_bytes=${Buffer.byteLength(body, "utf8")}`],
  });
}

export function encodeWakeContext(ctx: WakeContext): string {
  return JSON.stringify(WakeContextSchema.parse(ctx));
}

export function decodeWakeContext(raw: string | undefined): WakeContext | null {
  if (!raw) return null;
  try {
    return WakeContextSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function wakeEnv(ctx: WakeContext | null | undefined): NodeJS.ProcessEnv {
  return ctx ? { ...process.env, [ENV_KEY]: encodeWakeContext(ctx) } : process.env;
}

export function wakeContextFromEnv(env: NodeJS.ProcessEnv = process.env): WakeContext | null {
  return decodeWakeContext(env[ENV_KEY]);
}

export async function enqueueLoopWake(dataDir: string, ctx: WakeContext): Promise<void> {
  await mkdir(loopsDir(dataDir), { recursive: true });
  await appendFile(queuePath(dataDir), `${encodeWakeContext(ctx)}\n`, "utf8");
}

export async function drainLoopWakes(dataDir: string): Promise<WakeContext[]> {
  let raw = "";
  try {
    raw = await readFile(queuePath(dataDir), "utf8");
  } catch {
    return [];
  }
  await writeFile(queuePath(dataDir), "", "utf8").catch(() => {});
  return raw
    .split("\n")
    .map((line) => decodeWakeContext(line))
    .filter((ctx): ctx is WakeContext => ctx !== null);
}

function loopDelta(state: LoopState, now: Date): string[] {
  const delta = [
    `woke_at=${now.toISOString()}`,
    `iterations=${state.iterations}`,
    `last_score=${state.lastScore ?? "none"}`,
    `best_score=${state.bestScore ?? "none"}`,
  ];
  const last = state.history.at(-1);
  if (last) delta.push(`last_outcome=${last.note}`);
  return delta;
}

function queuePath(dataDir: string): string {
  return join(loopsDir(dataDir), WAKE_QUEUE);
}
