// VANTA-PARALLEL-TOOL-EXEC — pure planner for concurrent read-only tool calls.
//
// When a model returns several tool calls in one turn, the concurrency-SAFE
// read-only ones (the existing `CONCURRENCY_SAFE_TOOLS` allowlist) can run
// concurrently under a bounded cap; mutating / unsafe calls stay sequential and
// strictly ordered. This module is the PURE partition + cap + reassembly layer:
// no I/O, no dispatch — `turn-loop.ts processToolCalls` (the wire point) consumes
// the groups, runs each batch concurrently, and reassembles results in call order.
//
// Default cap = 1 → every call becomes its own sequential group, so the planned
// execution order is byte-identical to the current strictly-sequential loop.

import { isConcurrencySafe } from "./stream-dispatch.js";
import type { ToolCall } from "../types.js";

/** Hard upper bound on concurrency — a sane ceiling regardless of env. */
export const MAX_PARALLEL_CAP = 8;
/** Default cap = 1 preserves the current strictly-sequential behavior exactly. */
export const DEFAULT_PARALLEL_CAP = 1;

const ENV_KEY = "VANTA_PARALLEL_TOOLS";

/**
 * Resolve the concurrency cap from the environment.
 * `VANTA_PARALLEL_TOOLS` overrides the default; clamped to [1, MAX_PARALLEL_CAP].
 * Absent / unparseable / out-of-range → DEFAULT_PARALLEL_CAP (1 = sequential).
 */
export function resolveParallelCap(env: Record<string, string | undefined>): number {
  const raw = env[ENV_KEY];
  if (raw === undefined || raw.trim() === "") return DEFAULT_PARALLEL_CAP;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_PARALLEL_CAP;
  const floored = Math.floor(n);
  if (floored < 1) return DEFAULT_PARALLEL_CAP;
  if (floored > MAX_PARALLEL_CAP) return MAX_PARALLEL_CAP;
  return floored;
}

/** Reuse the existing read-safe allowlist; never duplicate the set here. */
export function isConcurrencySafeTool(name: string): boolean {
  return isConcurrencySafe(name);
}

/**
 * One unit of execution: either a single (sequential) call or a batch of
 * consecutive concurrency-safe calls to run together (≤ cap). `parallel` marks
 * a batch the caller should await concurrently; a single call always runs alone.
 */
export type ExecGroup = { parallel: boolean; calls: ToolCall[] };

/**
 * Partition `calls` into ordered execution groups such that running the groups
 * in order — batches concurrently — preserves the original call order in the
 * reassembled results.
 *
 * - cap ≤ 1 → every call is its own sequential group (current behavior).
 * - cap N>1 → runs of consecutive concurrency-safe calls batch into groups of
 *   ≤ N; a mutating/unsafe call breaks the batch and is its own solo group.
 *
 * A solo batch (one safe call) is emitted as `parallel:false` so the wire point
 * treats it identically to a sequential call — no needless Promise.all of one.
 */
export function planToolExecution(calls: ToolCall[], cap: number): ExecGroup[] {
  const limit = cap < 1 ? 1 : Math.floor(cap);
  const groups: ExecGroup[] = [];
  let batch: ToolCall[] = [];
  const flush = (): void => {
    if (batch.length === 0) return;
    groups.push({ parallel: batch.length > 1, calls: batch });
    batch = [];
  };
  for (const call of calls) {
    if (limit <= 1 || !isConcurrencySafeTool(call.name)) {
      flush();
      groups.push({ parallel: false, calls: [call] });
      continue;
    }
    batch.push(call);
    if (batch.length >= limit) flush();
  }
  flush();
  return groups;
}

/**
 * Reassemble per-group results back into the original call order. `groups` and
 * `groupResults` are index-aligned (one results array per group, each in that
 * group's call order), so flattening in order restores the original sequence.
 */
export function reassembleResults<T>(groups: ExecGroup[], groupResults: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; i < groups.length; i++) {
    const results = groupResults[i] ?? [];
    for (const r of results) out.push(r);
  }
  return out;
}
