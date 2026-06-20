import type { Worker } from "./store.js";

// PCLIP-ORG-CHART — pure org-chart helpers over the worker roster. Reporting
// lines are derived from each worker's optional `managerId` edge (store.ts):
// roots have no (resolvable) manager; reports are workers whose managerId points
// at a given worker. Delegation routes DOWN to reports, escalation routes UP to
// the manager. All helpers are pure; the caller persists the result of setManager.

/** A roster worker with its direct reports nested underneath. */
export type OrgNode = {
  worker: Worker;
  reports: OrgNode[];
};

export type SetManagerResult =
  | { ok: true; roster: Worker[] }
  | { ok: false; error: string };

const INDENT = "  ";

/** Index workers by id (latest already deduped by callers). Pure. */
function indexById(workers: Worker[]): Map<string, Worker> {
  return new Map(workers.map((w) => [w.id, w]));
}

/** A worker's resolved manager id, or undefined if absent/dangling. Pure. */
function managerOf(worker: Worker, byId: Map<string, Worker>): string | undefined {
  const id = worker.managerId;
  // A dangling edge (manager not in roster) is treated as no manager → a root,
  // so a stale edge can never hide a worker from the chart.
  return id && byId.has(id) ? id : undefined;
}

/** Best display label for a worker row: title if set, else role. Pure. */
function labelOf(worker: Worker): string {
  return worker.title?.trim() || worker.role;
}

/**
 * Build a node + its reports, guarding against cycles. `seen` carries the ids on
 * the current path; a worker already on the path is skipped (its edge is the one
 * that would close the loop), so a bad edge can never infinite-loop. Pure.
 */
function buildNode(
  worker: Worker,
  childrenOf: Map<string, Worker[]>,
  seen: ReadonlySet<string>,
): OrgNode {
  const nextSeen = new Set(seen).add(worker.id);
  const reports = (childrenOf.get(worker.id) ?? [])
    .filter((child) => !nextSeen.has(child.id))
    .map((child) => buildNode(child, childrenOf, nextSeen));
  return { worker, reports };
}

/**
 * Build a nested org tree from managerId edges. Roots are workers with no
 * resolvable manager (none, or a dangling edge). Cycles are broken safely: the
 * edge that would re-enter a node already on the path is dropped. Pure.
 */
export function buildOrgTree(workers: Worker[]): OrgNode[] {
  const byId = indexById(workers);
  const childrenOf = new Map<string, Worker[]>();
  const roots: Worker[] = [];
  for (const w of workers) {
    const mgr = managerOf(w, byId);
    if (mgr === undefined) {
      roots.push(w);
      continue;
    }
    const siblings = childrenOf.get(mgr) ?? [];
    siblings.push(w);
    childrenOf.set(mgr, siblings);
  }
  // A worker caught only inside a pure cycle (every node has a resolvable
  // manager, so none are roots) would otherwise vanish; surface such nodes as
  // roots so the chart still shows every worker.
  const reachable = new Set<string>();
  const collect = (n: OrgNode): void => {
    reachable.add(n.worker.id);
    n.reports.forEach(collect);
  };
  const tree = roots.map((r) => buildNode(r, childrenOf, new Set<string>()));
  tree.forEach(collect);
  const orphans = workers.filter((w) => !reachable.has(w.id));
  for (const o of orphans) tree.push(buildNode(o, childrenOf, new Set<string>()));
  return tree;
}

/** Render one node and its subtree as indented lines. Pure. */
function renderNode(node: OrgNode, depth: number): string[] {
  const head = `${INDENT.repeat(depth + 1)}${node.worker.id} · ${labelOf(node.worker)}`;
  return [head, ...node.reports.flatMap((r) => renderNode(r, depth + 1))];
}

/** Render the roster as an indented text hierarchy (id · title/role). Pure. */
export function renderOrgChart(workers: Worker[]): string {
  const tree = buildOrgTree(workers);
  if (!tree.length) return "Org chart\n  (no workers)";
  const lines = tree.flatMap((n) => renderNode(n, 0));
  return ["Org chart", ...lines].join("\n");
}

/** Whether any worker carries a resolvable manager edge — drives conditional render. Pure. */
export function hasOrgEdges(workers: Worker[]): boolean {
  const byId = indexById(workers);
  return workers.some((w) => managerOf(w, byId) !== undefined);
}

/**
 * Who `fromId` delegates DOWN to: its direct reports (workers managed by it).
 * Empty when it has none or doesn't exist. Pure.
 */
export function resolveDelegateTarget(workers: Worker[], fromId: string): Worker[] {
  const byId = indexById(workers);
  if (!byId.has(fromId)) return [];
  return workers.filter((w) => managerOf(w, byId) === fromId);
}

/**
 * Who `fromId` escalates UP to: its manager. Undefined when it has no
 * (resolvable) manager or doesn't exist. Pure.
 */
export function resolveEscalateTarget(workers: Worker[], fromId: string): Worker | undefined {
  const byId = indexById(workers);
  const self = byId.get(fromId);
  if (!self) return undefined;
  const mgr = managerOf(self, byId);
  return mgr ? byId.get(mgr) : undefined;
}

/**
 * Walk up the management chain from `startId` toward the root, returning the
 * ordered ancestor ids. Stops on a cycle (an id seen twice). Pure.
 */
function ancestorChain(startId: string, byId: Map<string, Worker>): string[] {
  const chain: string[] = [];
  const seen = new Set<string>([startId]);
  let current = byId.get(startId);
  while (current) {
    const mgr = managerOf(current, byId);
    if (!mgr || seen.has(mgr)) break;
    chain.push(mgr);
    seen.add(mgr);
    current = byId.get(mgr);
  }
  return chain;
}

/**
 * Set `workerId`'s manager edge to `managerId`, returning a new roster.
 * Rejects: unknown worker/manager, self-management, and any edge that would
 * create a cycle (manager is already a descendant of the worker). Pure.
 */
export function setManager(
  workers: Worker[],
  workerId: string,
  managerId: string,
): SetManagerResult {
  const byId = indexById(workers);
  const worker = byId.get(workerId);
  if (!worker) return { ok: false, error: `unknown worker "${workerId}"` };
  if (!byId.has(managerId)) return { ok: false, error: `unknown manager "${managerId}"` };
  if (workerId === managerId) return { ok: false, error: "a worker cannot manage itself" };
  // Cycle guard: managerId must not already report (directly or transitively) up
  // through workerId — i.e. workerId must not be an ancestor of managerId.
  if (ancestorChain(managerId, byId).includes(workerId)) {
    return { ok: false, error: `setting "${managerId}" as manager of "${workerId}" would create a cycle` };
  }
  const roster = workers.map((w) => (w.id === workerId ? { ...w, managerId } : w));
  return { ok: true, roster };
}
