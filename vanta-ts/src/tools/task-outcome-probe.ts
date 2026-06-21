import { readWorkProducts } from "../cofounder/work-products.js";
import { artifactProbeForTask } from "../cofounder/outcome-gate.js";
import type { HasArtifact } from "../cofounder/outcome-contract.js";

// ENFORCED-OUTCOME-WIRE (live adapter) — reads the work-products store and hands
// advanceTask the artifact-existence probe for a task. The pure bridge lives in
// cofounder/outcome-gate.ts; this is the thin I/O seam at the advance site.
//
// DEFAULT-SAFE on the store side: a missing/corrupt store yields [] (the store
// reader is tolerant), and any unexpected read failure is caught here →
// "no artifacts" probe, which only matters when a required outcome is declared.
// It never throws and never blocks a contract-free task (advanceTask skips the
// gate entirely when the task has no outcome contract).

/**
 * Resolve the `HasArtifact` probe for a task from the work-products store.
 * Errors-as-values: a store read failure degrades to an empty probe (no
 * artifacts found) rather than throwing — the gate then refuses ONLY a task
 * that actually declared a required outcome and has no recorded artifact.
 */
export async function resolveTaskArtifactProbe(
  taskId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<HasArtifact> {
  try {
    const products = await readWorkProducts(env);
    return artifactProbeForTask(products, taskId);
  } catch {
    return () => false;
  }
}
