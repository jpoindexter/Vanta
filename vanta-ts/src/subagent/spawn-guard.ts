import { z } from "zod";
import { kernelAuthHeaders } from "../kernel/client.js";

// LIVENESS-WATCHDOG Part 2 (TS side) — every subagent spawn asks the kernel to
// gate it first. The kernel refuses a spawn whose depth exceeds its ceiling
// (runaway recursion halt) and records the decision to `.vanta/spawns.jsonl`.
// Depth is seeded from VANTA_SPAWN_DEPTH so the count survives across detached
// child processes, and incremented at each spawn (see subagent/spawn.ts).

const SpawnVerdictSchema = z.object({
  allowed: z.boolean(),
  reason: z.string(),
  depth: z.number(),
  max_depth: z.number(),
});

export type SpawnGuardVerdict = {
  allowed: boolean;
  reason: string;
  depth: number;
  maxDepth: number;
};

/** Legacy default metadata for refused/unverified checks; never authorizes a spawn. */
export const FALLBACK_MAX_DEPTH = 6;

/** Current spawn depth seed, propagated across processes via VANTA_SPAWN_DEPTH. */
export function resolveSpawnDepth(env: NodeJS.ProcessEnv): number {
  const n = Number(env.VANTA_SPAWN_DEPTH);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function kernelBaseUrl(env: NodeJS.ProcessEnv): string {
  return env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788";
}

export type SpawnGuardOptions = {
  parent: string;
  child: string;
  depth: number;
  root?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

/**
 * Ask the kernel to gate a spawn at `depth`. The kernel records the spawn and
 * refuses any depth past its ceiling. Missing authentication, unavailable or
 * unverified responses never authorize starting a worker.
 */
export async function checkSpawnDepth(opts: SpawnGuardOptions): Promise<SpawnGuardVerdict> {
  const base = opts.baseUrl ?? kernelBaseUrl(process.env);
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const auth = kernelAuthHeaders(opts.root);
    if (!auth.Authorization) return unverifiedVerdict(opts.depth);
    const r = await doFetch(`${base}/api/spawn`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ parent: opts.parent, child: opts.child, depth: opts.depth }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) return unverifiedVerdict(opts.depth);
    const json = SpawnVerdictSchema.parse(await r.json());
    return { allowed: json.allowed, reason: json.reason, depth: json.depth, maxDepth: json.max_depth };
  } catch {
    return unverifiedVerdict(opts.depth);
  }
}

function unverifiedVerdict(depth: number): SpawnGuardVerdict {
  return {
    allowed: false,
    reason: "kernel spawn authorization could not be verified; spawn refused",
    depth,
    maxDepth: FALLBACK_MAX_DEPTH,
  };
}

/** Run `fn` with VANTA_SPAWN_DEPTH set to `depth` so nested/detached spawns count
 * from here, restoring the prior value afterward. */
export async function withSpawnDepth<T>(depth: number, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.VANTA_SPAWN_DEPTH;
  process.env.VANTA_SPAWN_DEPTH = String(depth);
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.VANTA_SPAWN_DEPTH;
    else process.env.VANTA_SPAWN_DEPTH = prev;
  }
}
