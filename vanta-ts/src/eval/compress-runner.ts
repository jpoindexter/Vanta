import type { TaskRunner } from "./run.js";

// The impure seam between the CNG harness and the real agent runner. The compression
// dimensions are read from process.env at run time (prepare-helpers reads
// VANTA_SKILL_SUBSET/_DISTILLED; apply.ts reads VANTA_COMPRESS), so a treatment env
// overlay is applied to process.env AROUND each agent run and restored afterward.

/** Apply `overlay` to `env`, run `fn`, then restore exactly (deleting keys that
 * were absent before). Restores even if `fn` throws. */
export async function withEnv<T>(overlay: Record<string, string>, fn: () => Promise<T>, env: NodeJS.ProcessEnv = process.env): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(overlay)) prev[k] = env[k];
  Object.assign(env, overlay);
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(overlay)) {
      if (prev[k] === undefined) delete env[k];
      else env[k] = prev[k]!;
    }
  }
}

/** Wrap a base TaskRunner so every run executes under an env overlay. Used by the
 * CNG harness's `runForEnv`: the same real runner, scoped to a dimension's toggle. */
export function scopeRunnerToEnv(base: TaskRunner, env: NodeJS.ProcessEnv = process.env): (overlay: Record<string, string>) => TaskRunner {
  return (overlay) => (instruction, root) => withEnv(overlay, () => base(instruction, root), env);
}
