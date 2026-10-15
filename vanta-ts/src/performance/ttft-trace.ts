import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const TTFT_TRACE_VERSION = 1;

export type TtftStage = "turn_started" | "provider_dispatch" | "provider_first_delta";
export type TtftTraceEvent = {
  version: 1;
  stage: TtftStage;
  turnId: string;
  surface: string;
  pid: number;
  wallTimeUnixMs: number;
  monotonicNs: string;
};

let nextTurn = 0;
const recorded = new Set<string>();

export function beginTtftTurn(defaultSurface = "agent"): { turnId: string; surface: string } {
  const surface = process.env.VANTA_TTFT_SURFACE?.trim() || defaultSurface;
  const turnId = `${process.pid}-${++nextTurn}`;
  recordTtftStage("turn_started", { turnId, surface });
  return { turnId, surface };
}

export function recordTtftStage(
  stage: TtftStage,
  turn: { turnId: string; surface: string } | undefined,
): void {
  const path = process.env.VANTA_TTFT_TRACE;
  if (!path || !turn) return;
  const dedupeKey = `${turn.turnId}:${stage}`;
  if (recorded.has(dedupeKey)) return;
  recorded.add(dedupeKey);
  const event: TtftTraceEvent = {
    version: TTFT_TRACE_VERSION,
    stage,
    turnId: turn.turnId,
    surface: turn.surface,
    pid: process.pid,
    wallTimeUnixMs: Date.now(),
    monotonicNs: process.hrtime.bigint().toString(),
  };
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    appendFileSync(path, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
  } catch {
    // Measurement is opt-in and must never interfere with an operator turn.
  }
}
