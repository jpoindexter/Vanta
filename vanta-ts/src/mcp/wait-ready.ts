// VANTA-WAIT-MCP — block until mounted MCP servers report ready (or time out).
//
// A tool that depends on an MCP server must not run before that server's tools
// are live in the registry. This module is the PURE, injectable readiness-poll
// behind a `wait_for_mcp_servers`-style capability: it polls a status source on
// an interval until every required server is "connected" (reusing the
// `McpServerStatus {name, state}` model from server-control.ts) OR a timeout
// elapses, then summarizes the outcome.
//
// PURE / injectable (no real clock, no timers, no IO): `waitForMcpReady` takes
// {getStatuses, sleep, now, timeoutMs?, intervalMs?, required?} so tests drive
// it with a fake clock. A getStatuses throw is treated as "not ready" — never
// thrown out.
//
// HOST WIRING (deliberately out of scope this round, named for clarity): a
// future `wait_for_mcp_servers` tool — or the run host before dispatching an
// MCP-dependent tool — calls `waitForMcpReady` with a live `getStatuses` that
// reads the current mounted-server states (the same `McpServerStatus[]` the
// `/mcp` panel builds from mount.ts's mounted servers + server-control state),
// a real `sleep` (setTimeout) and `now` (Date.now), then surfaces
// `formatWaitResult(result)` to the operator.

import type { McpServerStatus } from "./server-control.js";

/** Default poll interval (ms) between status checks. */
const DEFAULT_INTERVAL_MS = 100;
/** Default overall wait budget (ms) before giving up. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Injected dependencies for the readiness poll (no real clock/timers/IO). */
export type WaitForMcpDeps = {
  /** Live status source; may throw — a throw is treated as not-ready. */
  getStatuses: () => McpServerStatus[] | Promise<McpServerStatus[]>;
  /** Sleep `ms` (inject a fake for tests). */
  sleep: (ms: number) => Promise<void>;
  /** Current epoch ms (inject a fake clock for tests). */
  now: () => number;
  /** Overall wait budget; default 30s. */
  timeoutMs?: number;
  /** Poll interval between checks; default 100ms. */
  intervalMs?: number;
  /** Only these server names must be connected; omit = all non-disabled. */
  required?: string[];
};

/** The outcome of a readiness wait. */
export type WaitForMcpResult = {
  ready: boolean;
  waitedMs: number;
  statuses: McpServerStatus[];
  timedOut: boolean;
};

/**
 * Are all required servers connected? Pure.
 *
 *   required given → every named server must exist AND be "connected"
 *   required omitted → every NON-disabled server must be "connected"
 *                       (disabled servers are intentionally off, so ignored)
 *   no servers (and none required) → true (nothing to wait for)
 */
export function allReady(statuses: McpServerStatus[], required?: string[]): boolean {
  if (required && required.length > 0) {
    return required.every((name) => {
      const s = statuses.find((x) => x.name === name);
      return s?.state === "connected";
    });
  }
  return statuses
    .filter((s) => s.state !== "disabled")
    .every((s) => s.state === "connected");
}

/** Names of servers still not connected (laggards) for the summary. */
function laggards(statuses: McpServerStatus[], required?: string[]): string[] {
  if (required && required.length > 0) {
    return required.filter((name) => {
      const s = statuses.find((x) => x.name === name);
      return s?.state !== "connected";
    });
  }
  return statuses
    .filter((s) => s.state !== "disabled" && s.state !== "connected")
    .map((s) => s.name);
}

/** A status read: either a real snapshot, or `failed` (the source threw). */
type Snapshot = { statuses: McpServerStatus[]; failed: boolean };

/**
 * Read statuses, treating any throw as a FAILED read (not-ready) — distinct
 * from a genuine empty snapshot (zero servers reported, which IS ready).
 */
async function safeStatuses(getStatuses: WaitForMcpDeps["getStatuses"]): Promise<Snapshot> {
  try {
    return { statuses: await getStatuses(), failed: false };
  } catch {
    return { statuses: [], failed: true };
  }
}

/**
 * Poll `getStatuses` on `intervalMs` until `allReady` OR `timeoutMs` elapses.
 * Already-ready (or no required work) returns immediately after the first poll.
 * A `getStatuses` throw is treated as not-ready and never thrown out.
 */
export async function waitForMcpReady(deps: WaitForMcpDeps): Promise<WaitForMcpResult> {
  const { getStatuses, sleep, now } = deps;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  const required = deps.required;
  const start = now();

  let snap = await safeStatuses(getStatuses);
  if (!snap.failed && allReady(snap.statuses, required)) {
    return { ready: true, waitedMs: now() - start, statuses: snap.statuses, timedOut: false };
  }

  while (now() - start < timeoutMs) {
    await sleep(intervalMs);
    snap = await safeStatuses(getStatuses);
    if (!snap.failed && allReady(snap.statuses, required)) {
      return { ready: true, waitedMs: now() - start, statuses: snap.statuses, timedOut: false };
    }
  }

  return { ready: false, waitedMs: now() - start, statuses: snap.statuses, timedOut: true };
}

/** Seconds (1 decimal) for the summary line. */
function secs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** One-line summary: ready count + time, or timeout + the laggards. */
export function formatWaitResult(result: WaitForMcpResult, required?: string[]): string {
  if (result.ready) {
    const ready = result.statuses.filter((s) => s.state === "connected").length;
    const label = ready === 1 ? "server" : "servers";
    return `✓ ${ready} MCP ${label} ready in ${secs(result.waitedMs)}`;
  }
  const names = laggards(result.statuses, required);
  const not = names.length > 0 ? names.join(", ") : "no servers reported";
  return `⚠ timed out after ${secs(result.waitedMs)} — ${not} not connected`;
}
