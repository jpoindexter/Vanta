import { AsyncLocalStorage } from "node:async_hooks";

// VANTA-SWARM-IN-PROCESS — in-process swarm worker context.
//
// Multiple swarm/fleet workers can run CONCURRENTLY in the SAME Node process
// (no subprocess, no worktree) — the in-process backend is the lighter sibling
// of the worktree-isolated `fleet/fleet.ts`. Each worker needs to see ITS OWN
// identity (worker id / goal / data dir / scope root) without that state
// bleeding into a sibling worker running interleaved async work on the same
// event loop. `AsyncLocalStorage` gives exactly that: a per-async-execution
// store that follows `await` boundaries, so two concurrent `runInWorkerContext`
// calls each read their own context throughout — even with interleaved awaits.
//
// SECURITY: this context is for ISOLATION + observability ONLY — it is NOT a
// security boundary. A worker reading `currentWorkerId()` is for routing/logging
// (e.g. perm-routing forwards a worker's `ask` keyed by its id), not for
// granting capability. The kernel `assess()` gate still runs on EVERY worker
// tool call; the ALS store never decides safety and cannot be one (it lives in
// the same process the worker controls). Bypassing or spoofing it changes only
// labels, never what the kernel permits.
//
// WIRING (where the live flow WOULD call this, NOT done this round):
//   subagent/spawn.ts runWorker: wrap the worker's `convo.send(...)` (and its
//     hook/sidechain side effects) in
//       runInWorkerContext({ workerId, goal: opts.goal, dataDir }, () => …)
//     so each concurrent in-process worker run isolates its identity for the
//     duration of that run. `dataDir` = join(deps.root, ".vanta"); `scopeRoot`
//     = deps.root when a per-worker scope is set.
//   subagent/perm-routing.ts + logging: read `currentWorkerId()` to key a
//     forwarded `ask` / an event line to the asking worker, instead of
//     threading a workerId arg through every call site. Outside any worker run
//     (the lead agent's own turn) `currentWorkerId()` is undefined → no label.

/** A single in-process worker's ambient identity. `workerId` is the only
 *  required field; the rest scope the worker when set. */
export type WorkerContext = {
  /** Stable id of the worker whose async execution this context belongs to. */
  workerId: string;
  /** The worker's single scoped goal, if it was spawned with one. */
  goal?: string;
  /** The worker's `.vanta` data dir, if it runs against a distinct one. */
  dataDir?: string;
  /** The worker's scope root, if a per-worker scope is in effect. */
  scopeRoot?: string;
};

// Module-level store: ONE per process, shared by every worker. The store value
// is swapped per async-execution by `runInWorkerContext`, never mutated, so
// concurrent runs never see each other's value.
const store = new AsyncLocalStorage<WorkerContext>();

/**
 * Run `fn` inside the worker context `ctx`. Everything `fn` awaits — however
 * deeply nested or interleaved with other workers — reads `ctx` via
 * `currentWorkerContext()`/`currentWorkerId()`. Returns `fn`'s promise verbatim.
 *
 * Errors propagate: if `fn` throws/rejects, the rejection passes through
 * unchanged, and the ALS context still unwinds (it is scoped to this call's
 * async execution, restored automatically by the runtime).
 */
export function runInWorkerContext<T>(ctx: WorkerContext, fn: () => Promise<T>): Promise<T> {
  return store.run(ctx, fn);
}

/** The active worker context, or `undefined` outside any `runInWorkerContext`
 *  call (e.g. the lead agent's own turn). A safe default — never throws. */
export function currentWorkerContext(): WorkerContext | undefined {
  return store.getStore();
}

/** The active worker's id, or `undefined` outside any worker context. */
export function currentWorkerId(): string | undefined {
  return store.getStore()?.workerId;
}

/** Whether the caller is currently inside a worker context. */
export function isInWorkerContext(): boolean {
  return store.getStore() !== undefined;
}

/**
 * Run `fn` in a context merged from the CURRENT context plus `partial` (for
 * nested scoping — e.g. narrowing `scopeRoot` for a sub-step). The merge is
 * shallow: `partial` keys override the current context's. When there is no
 * current context, `partial` must supply `workerId` (it does in practice —
 * nesting happens inside a worker run); if it doesn't, the merged `workerId`
 * is the empty string rather than throwing, keeping the call a safe no-throw.
 * On exit, the outer context is restored automatically by the runtime.
 */
export function withWorkerOverride<T>(partial: Partial<WorkerContext>, fn: () => Promise<T>): Promise<T> {
  const current = store.getStore();
  const merged: WorkerContext = { workerId: "", ...current, ...partial };
  return store.run(merged, fn);
}
