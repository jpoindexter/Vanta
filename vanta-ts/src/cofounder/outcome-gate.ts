// ENFORCED-OUTCOME-WIRE — the bridge between the pure outcome gate
// (cofounder/outcome-contract.ts) and the work-products store
// (cofounder/work-products.ts), used at the live task-advance-to-done site.
//
// This is a COMPLETION-EVIDENCE gate, NOT a permission gate: the Rust kernel
// still assesses every tool a task's work invokes. This only decides whether a
// task that DECLARED a required outcome may read as "done" — by checking the
// work-products store for an artifact this task actually produced.
//
// DEFAULT-PERMISSIVE by construction: a task with no `outcome` contract never
// reaches this predicate (advanceTask skips the gate), so the common case is
// unchanged. The predicate is consulted ONLY when a required outcome is
// declared. PURE + injectable — no I/O here; the caller supplies the store list.

import type { WorkProduct } from "./work-products.js";
import type { HasArtifact } from "./outcome-contract.js";

/**
 * Did this task produce a work-product? A declared outcome is "satisfied" when
 * the work-products store holds at least one artifact whose `sourceTaskId`
 * matches the task — i.e. the task left durable evidence of its output. Pure.
 */
export function taskProducedArtifact(products: WorkProduct[], taskId: string): boolean {
  const id = taskId.trim();
  if (!id) return false;
  return products.some((p) => p.sourceTaskId === id);
}

/**
 * Build the gate's `HasArtifact` predicate from a work-products list for a
 * specific task. The contract's `expectedOutput` type name is accepted (gate
 * contract) but the store linkage is by `sourceTaskId`: any artifact produced
 * by this task satisfies its declared outcome. Pure + injectable.
 */
export function artifactProbeForTask(products: WorkProduct[], taskId: string): HasArtifact {
  return () => taskProducedArtifact(products, taskId);
}
