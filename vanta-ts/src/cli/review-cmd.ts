import {
  appendRevision,
  approveArtifact,
  listPendingArtifacts,
  requestRevision,
  type ReviewDeps,
} from "../cofounder/outcome-approval.js";
import {
  readWorkProducts,
  setApproved as setApprovedPure,
  writeWorkProducts,
  type WorkProduct,
} from "../cofounder/work-products.js";

// `vanta review pending` / `approve <id>` / `revise <id> <reason...>`.
// The artifact-review approval gate over completed WORK PRODUCTS — distinct from
// the kernel's pre-ACTION Ask gate. `pending` lists not-yet-approved artifacts;
// `approve` flips a work-product's approved state (which can unblock dependents);
// `revise` records WHY it was sent back and re-runs the producing task. Handlers
// are pure over injected deps so the whole surface is unit-tested without real
// I/O. NOT wired into cli.ts/ops.ts — dispatch wiring is the `runReviewCommand`
// exported below, ready to add as one `vanta review` entry.

export type ReviewCmdDeps = {
  /** Read the current work-product list (the review queue source). */
  readWorkProducts: () => Promise<WorkProduct[]>;
  /** The injectable review-queue effects (setApproved/rerunTask/appendRevision/now). */
  review: ReviewDeps;
  log: (line: string) => void;
};

const USAGE = [
  "usage:",
  "  vanta review pending",
  "  vanta review approve <work-product-id>",
  "  vanta review revise <work-product-id> <reason...>",
].join("\n");

/** Render one pending artifact as a review-queue line. Pure. */
export function formatPending(p: WorkProduct): string {
  return `${p.id} · ${p.kind} · ${p.artifact} · ${p.departmentId}/${p.producedBy} · task ${p.sourceTaskId}`;
}

/** `review pending` — list every not-yet-approved artifact, newest-first. */
export async function handlePending(deps: ReviewCmdDeps): Promise<number> {
  const pending = listPendingArtifacts(await deps.readWorkProducts());
  if (pending.length === 0) {
    deps.log("no pending artifacts — every work product is approved");
    return 0;
  }
  for (const p of pending) deps.log(formatPending(p));
  return 0;
}

/** `review approve <id>` — flip a work product's approved state (can unblock dependents). */
export async function handleApprove(workProductId: string, deps: ReviewCmdDeps): Promise<number> {
  const r = await approveArtifact(workProductId, deps.review);
  if (!r.ok) {
    deps.log(r.error);
    return 1;
  }
  deps.log(`approved ${workProductId.trim()}`);
  return 0;
}

/** `review revise <id> <reason...>` — record the reason + re-run the producing task. */
export async function handleRevise(workProductId: string, reason: string, deps: ReviewCmdDeps): Promise<number> {
  const products = await deps.readWorkProducts();
  const r = await requestRevision(workProductId, reason, products, deps.review);
  if (!r.ok) {
    deps.log(r.error);
    return 1;
  }
  deps.log(`revision requested for ${r.value.workProductId} — re-running its producing task`);
  return 0;
}

/** Dispatch a parsed `vanta review <sub>` against injected deps. Pure orchestration. */
export async function handleReview(rest: string[], deps: ReviewCmdDeps): Promise<number> {
  const [sub, ...args] = rest;
  switch (sub) {
    case "pending":
      return handlePending(deps);
    case "approve": {
      const [id] = args;
      if (id === undefined) {
        deps.log(`approve needs a work-product id\n${USAGE}`);
        return 1;
      }
      return handleApprove(id, deps);
    }
    case "revise": {
      const [id, ...reasonParts] = args;
      const reason = reasonParts.join(" ");
      if (id === undefined || reason.trim() === "") {
        deps.log(`revise needs a work-product id and a reason\n${USAGE}`);
        return 1;
      }
      return handleRevise(id, reason, deps);
    }
    default:
      deps.log(USAGE);
      return sub ? 1 : 0;
  }
}

/**
 * Build live deps: work products in `~/.vanta/work-products.json`; setApproved
 * reads → flips → persists the list; the revision log appends to
 * `~/.vanta/artifact-reviews.json`. `rerunTask` is the injected producing-task
 * runner — live wiring is deferred to the dispatch site (kept a no-op here so
 * approve/list work standalone until the runner is provided).
 */
function liveReviewDeps(rerunTask: ReviewDeps["rerunTask"]): ReviewCmdDeps {
  const review: ReviewDeps = {
    setApproved: async (id, approved) => {
      const list = await readWorkProducts();
      const r = setApprovedPure(list, id, approved);
      if (r.ok) await writeWorkProducts(r.value);
      return r;
    },
    rerunTask,
    appendRevision: (record) => appendRevision(record),
  };
  return { readWorkProducts: () => readWorkProducts(), review, log: (line) => console.log(line) };
}

export async function runReviewCommand(rest: string[], rerunTask?: ReviewDeps["rerunTask"]): Promise<number> {
  const runner: ReviewDeps["rerunTask"] = rerunTask ?? (async () => {});
  return handleReview(rest, liveReviewDeps(runner));
}
