import { autonomyCapForFiles } from "./compartments.js";
import { assessMergeRisk, resolveMergeTarget } from "./merge.js";
import { listPreExistingFiles } from "./verifier.js";
import type { FactoryConfig, CycleResult, FactoryDeps, FactoryPlan, WorkItem, SliceArtifact } from "./types.js";
import type { CodeIntelProvider } from "../code-intel/provider.js";

// The execute→verify→land pipeline a factory cycle runs after gating + planning. Still under
// factory/ so it stays kernel-protected (no autonomous write can touch it); `run.ts` orchestrates it.
// CODE-INTEL-FACTORY-WIRING: `codeIntel` (when present) reaches the verify gate's affected-tests
// fast-check; absent → the gate is skipped and verify behaves exactly as before.
export type CycleCtx = {
  config: FactoryConfig;
  item: WorkItem;
  deps: FactoryDeps;
  log: (msg: string) => void;
  codeIntel?: CodeIntelProvider;
};
type ExecOutcome = { ok: boolean; artifact: SliceArtifact; reason?: string };

/**
 * Execute the plan and verify it, with bounded retry + model escalation on a stall.
 * FAC-STALL + FAC-ESCALATE: retries up to VANTA_FACTORY_MAX_RETRIES, escalating to
 * VANTA_MODEL_EXPENSIVE after VANTA_FACTORY_ESCALATE_AFTER stall iterations. Returns the
 * last artifact and whether verify passed; retry slices are discarded as it goes (the
 * final discard on failure stays with the caller, mirroring the original flow).
 */
export async function executeWithVerify(
  ctx: CycleCtx,
  plan: FactoryPlan,
  preExisting: Awaited<ReturnType<typeof listPreExistingFiles>>,
): Promise<ExecOutcome> {
  const { config, item, deps, log } = ctx;
  const maxRetries = Math.max(0, parseInt(process.env.VANTA_FACTORY_MAX_RETRIES ?? "1", 10));
  const escalateAfter = Math.max(1, parseInt(process.env.VANTA_FACTORY_ESCALATE_AFTER ?? "1", 10));
  let artifact = await deps.execute(config.vantaRoot, plan, config.budgetTokens);
  log(`factory: executing… ${artifact.touchedFiles.length} file(s) touched, ~${artifact.tokenSpend.toLocaleString()} tokens`);
  let verifyResult = await deps.verify(config.vantaRoot, artifact, preExisting, { workItem: item, codeIntel: ctx.codeIntel });
  let totalTokens = artifact.tokenSpend;
  for (let retry = 1; !verifyResult.ok && retry <= maxRetries; retry++) {
    const escalate = retry >= escalateAfter && process.env.VANTA_MODEL_EXPENSIVE;
    const escalateNote = escalate ? ` [escalating to ${process.env.VANTA_MODEL_EXPENSIVE}]` : "";
    log(`factory: stall — verify-fail (${verifyResult.reason}) — retrying (${retry}/${maxRetries})${escalateNote}…`);
    await deps.vcs.discardSlice(config.vantaRoot);
    const retryBranch = await deps.vcs.createBranch(config.vantaRoot);
    log(`factory: branched → ${retryBranch}`);
    const retryInstruction = `${plan.instruction}\n\n[Retry ${retry}] Previous attempt failed: ${verifyResult.reason}. Try a different approach.`;
    // FAC-ESCALATE: override VANTA_MODEL to the expensive model when stalled.
    if (escalate) process.env.VANTA_MODEL = process.env.VANTA_MODEL_EXPENSIVE!;
    artifact = await deps.execute(config.vantaRoot, { ...plan, instruction: retryInstruction }, config.budgetTokens);
    if (escalate) delete process.env.VANTA_MODEL; // restore default after retry
    totalTokens += artifact.tokenSpend;
    log(`factory: retry ${retry}: ${artifact.touchedFiles.length} file(s), ~${artifact.tokenSpend.toLocaleString()} tokens (total ~${totalTokens.toLocaleString()})`);
    verifyResult = await deps.verify(config.vantaRoot, artifact, preExisting, { workItem: item, codeIntel: ctx.codeIntel });
  }
  return { ok: verifyResult.ok, artifact, reason: verifyResult.reason };
}

/**
 * After a clean verify, walk the autonomy ladder: clamp to the compartment cap (O11),
 * then implement (L2) → commit (L3) → push (L4) → merge (L5, gated). Returns the CycleResult.
 */
export async function landVerifiedSlice(
  ctx: CycleCtx,
  branch: string,
  startBranch: string,
  artifact: SliceArtifact,
): Promise<CycleResult> {
  const { config, item, deps, log } = ctx;
  // O11 — clamp the requested level to the most restrictive compartment the slice touched.
  const cap = autonomyCapForFiles(artifact.touchedFiles);
  const effectiveLevel = Math.min(config.autonomyLevel, cap.maxLevel);
  if (effectiveLevel < config.autonomyLevel) {
    log(`factory: [O11] ${cap.compartment} compartment caps autonomy at L${cap.maxLevel} — clamping from L${config.autonomyLevel}`);
  }

  if (effectiveLevel <= 2) {
    // L2 implement — leave the verified changes on the branch for human review.
    log(`factory: [L2] verified on ${branch} — review the diff, then commit when ready.`);
    return { status: "implemented", workItem: item, branch, tokenSpend: artifact.tokenSpend };
  }

  const msg = `factory(auto): ${item.description}\n\ncategory: ${item.category}\ntokens: ${artifact.tokenSpend.toLocaleString()}\nbranch: ${branch}`;
  const sha = await deps.vcs.commit(config.vantaRoot, msg);
  log(`factory: committed ${sha}`);
  // FAC-CLOSE: mark the roadmap item shipped so the KANBAN reflects the close.
  if (item.roadmapId && item.category === "roadmap") {
    const { moveRoadmapItem } = await import("../roadmap/move.js");
    await moveRoadmapItem(config.vantaRoot, item.roadmapId, "shipped").catch(() => {});
    log(`factory: closed roadmap item ${item.roadmapId}`);
  }

  if (effectiveLevel <= 3) {
    // L3 commit — committed locally, but not pushed.
    return { status: "committed", workItem: item, branch, commitSha: sha, tokenSpend: artifact.tokenSpend, pushed: false };
  }

  // L4 push — publish the branch.
  await deps.vcs.push(config.vantaRoot);
  log(`factory: pushed ${branch}`);

  if (effectiveLevel <= 4) {
    return { status: "committed", workItem: item, branch, commitSha: sha, tokenSpend: artifact.tokenSpend, pushed: true };
  }

  // L5 merge — gated auto-land into the integration branch (merge.ts is the entire safety story).
  return tryMerge({ ctx, branch, startBranch, sha, artifact });
}

/**
 * L5 — auto-land the slice into the integration branch iff the low-risk gate (merge.ts) passes;
 * otherwise stay at L4 push. The gate, not the kernel, is the entire safety story here (git runs
 * outside assess()) and fails closed.
 */
async function tryMerge(opts: {
  ctx: CycleCtx;
  branch: string;
  startBranch: string;
  sha: string;
  artifact: SliceArtifact;
}): Promise<CycleResult> {
  const { ctx, branch, startBranch, sha, artifact } = opts;
  const { config, item, deps, log } = ctx;
  const stayL4: CycleResult = { status: "committed", workItem: item, branch, commitSha: sha, tokenSpend: artifact.tokenSpend, pushed: true };
  const mergeTarget = resolveMergeTarget(process.env);
  const decision = assessMergeRisk({
    touchedFiles: artifact.touchedFiles,
    diffLineCount: await deps.vcs.lastCommitLineCount(config.vantaRoot),
    allowMerge: Boolean(process.env.VANTA_AUTONOMY_ALLOW_MERGE),
    mergeTarget,
  });
  if (!decision.merge) {
    log(`factory: [L5] not merging — ${decision.reason} (left at L4 push on ${branch})`);
    return stayL4;
  }
  const merged = await deps.vcs.merge(config.vantaRoot, mergeTarget, branch, startBranch);
  if (!merged) {
    log(`factory: [L5] merge into ${mergeTarget} failed (conflict or missing target) — left at L4 push on ${branch}`);
    return stayL4;
  }
  log(`factory: [L5] merged ${branch} → ${mergeTarget}`);
  return { status: "merged", workItem: item, branch, commitSha: sha, tokenSpend: artifact.tokenSpend, mergedInto: mergeTarget };
}
