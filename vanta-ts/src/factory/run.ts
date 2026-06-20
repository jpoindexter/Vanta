import { join } from "node:path";
import { triage } from "./triage.js";
import { buildPlan } from "./planner.js";
import { execute } from "./executor.js";
import { verify, listPreExistingFiles } from "./verifier.js";
import { autonomyCapForFiles } from "./compartments.js";
import { assessMergeRisk, resolveMergeTarget } from "./merge.js";
import { shouldClarify, buildPrefightNote } from "./preflight.js";
import { defaultVcs } from "./vcs.js";
import type { FactoryConfig, CycleResult, AutonomyLevel, FactoryDeps } from "./types.js";

// --- Pure helpers ---

export type GateInputs = { disabled: boolean; lockExists: boolean; treeDirty: boolean };

export function checkGate(_config: FactoryConfig, inputs: GateInputs): string | null {
  if (inputs.disabled) return "factory disabled (VANTA_FACTORY_DISABLED is set)";
  if (inputs.lockExists) return "another factory cycle is already running (lockfile exists)";
  if (inputs.treeDirty) return "working tree has uncommitted changes — will not run alongside a live session";
  return null;
}

/** Highest ladder rung implemented (L5 auto-merge — gated by VANTA_AUTONOMY_ALLOW_MERGE). */
export const MAX_AUTONOMY_LEVEL = 5;

/**
 * Resolve the factory autonomy level (1–5) from the CLI subcommand + env.
 * `improve`/review is always suggest-only (L1). `approve` reads VANTA_AUTONOMY_LEVEL
 * (default 4 = commit+push, preserving prior behavior); out-of-range clamps into 1–5.
 * Note: requesting L5 only auto-merges when VANTA_AUTONOMY_ALLOW_MERGE is also set and
 * the slice passes the low-risk gate (merge.ts) — otherwise it lands at L4 push.
 */
export function resolveAutonomyLevel(sub: string, env: NodeJS.ProcessEnv): AutonomyLevel {
  if (sub === "review" || sub === "") return 1;
  const raw = Number(env.VANTA_AUTONOMY_LEVEL);
  if (!Number.isInteger(raw) || raw < 1) return 4;
  return Math.min(raw, MAX_AUTONOMY_LEVEL) as AutonomyLevel;
}

export function formatCycleLog(result: CycleResult): string {
  switch (result.status) {
    case "nothing-to-do":
      return "factory: nothing to do — backlog is clean";
    case "aborted":
      return `factory: aborted — ${result.reason}`;
    case "verify-failed":
      return `factory: verify-failed — ${result.reason} (work discarded, no history entry)`;
    case "implemented":
      return `factory: implemented on ${result.branch} (${result.tokenSpend.toLocaleString()} tokens) — verified, NOT committed; review the diff then commit — ${result.workItem.description}`;
    case "committed":
      return `factory: committed ${result.commitSha} on ${result.branch} ${result.pushed ? "(pushed)" : "(local — not pushed)"} (${result.tokenSpend.toLocaleString()} tokens) — ${result.workItem.description}`;
    case "merged":
      return `factory: merged ${result.commitSha} (${result.branch}) → ${result.mergedInto} (${result.tokenSpend.toLocaleString()} tokens) — ${result.workItem.description}`;
  }
}

// --- I/O ---

const LOCK_FILE = "factory.lock";

async function acquireLock(dataDir: string): Promise<boolean> {
  const { writeFile, access } = await import("node:fs/promises");
  const lock = join(dataDir, LOCK_FILE);
  try {
    await access(lock);
    return false; // already exists
  } catch {
    await writeFile(lock, String(process.pid), { flag: "wx" });
    return true;
  }
}

async function releaseLock(dataDir: string): Promise<void> {
  const { rm } = await import("node:fs/promises");
  await rm(join(dataDir, LOCK_FILE), { force: true });
}

/**
 * The real pipeline: each stage wired to its module + the default git adapter
 * (vcs.ts). `runCycle` defaults to this; tests inject a fake/partial FactoryDeps
 * to drive a full cycle without git or an LLM.
 */
export const defaultFactoryDeps: FactoryDeps = {
  triage,
  plan: buildPlan,
  execute,
  verify,
  vcs: defaultVcs,
};

/**
 * Run one complete factory cycle: gate → triage → branch → plan → execute → verify → commit.
 * In review mode, prints the plan and exits for human approval (run `vanta factory approve` to proceed).
 */
export async function runCycle(
  config: FactoryConfig,
  log: (msg: string) => void = console.log,
  deps: FactoryDeps = defaultFactoryDeps,
): Promise<CycleResult> {
  const treeDirty = await deps.vcs.isTreeDirty(config.vantaRoot);
  const acquired = await acquireLock(config.dataDir);
  const lockExists = !acquired;
  const disabled = Boolean(process.env.VANTA_FACTORY_DISABLED);

  const bail = checkGate(config, { disabled, lockExists, treeDirty });
  if (bail) {
    if (acquired) await releaseLock(config.dataDir);
    return { status: "aborted", reason: bail };
  }

  try {
    log("factory: triaging backlog…");
    const item = await deps.triage(config.vantaRoot);
    if (!item) return { status: "nothing-to-do" };
    log(`factory: [${item.category}] ${item.description}`);

    // FAC-PREFLIGHT: gate on ambiguity before branching or touching the tree.
    if (shouldClarify(item, process.env)) {
      log(buildPrefightNote(item));
      return { status: "aborted", reason: "item too vague — add context then re-run" };
    }

    const plan = deps.plan(item, config.vantaRoot);
    if (config.interactive) log(`\nPlan:\n${plan.instruction}\n`);

    const level = config.autonomyLevel;

    if (level <= 1) {
      // L1 suggest — print the plan, change nothing (no branch).
      log(`[L1 suggest] Run 'vanta factory approve' to implement this plan.`);
      return { status: "aborted", reason: "suggest mode (L1) — awaiting approval (run: vanta factory approve)" };
    }

    const preExisting = await listPreExistingFiles(config.vantaRoot);
    const startBranch = await deps.vcs.currentBranch(config.vantaRoot);
    const branch = await deps.vcs.createBranch(config.vantaRoot);
    log(`factory: branched → ${branch}`);

    // FAC-STALL + FAC-ESCALATE: bounded retry; escalates to a stronger model after
    // VANTA_FACTORY_ESCALATE_AFTER (default 1) stall iterations.
    const maxRetries = Math.max(0, parseInt(process.env.VANTA_FACTORY_MAX_RETRIES ?? "1", 10));
    const escalateAfter = Math.max(1, parseInt(process.env.VANTA_FACTORY_ESCALATE_AFTER ?? "1", 10));
    let artifact = await deps.execute(config.vantaRoot, plan, config.budgetTokens);
    log(`factory: executing… ${artifact.touchedFiles.length} file(s) touched, ~${artifact.tokenSpend.toLocaleString()} tokens`);
    let verifyResult = await deps.verify(config.vantaRoot, artifact, preExisting, { workItem: item });
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
      verifyResult = await deps.verify(config.vantaRoot, artifact, preExisting, { workItem: item });
    }
    if (!verifyResult.ok) {
      log(`factory: verification failed — ${verifyResult.reason}`);
      await deps.vcs.discardSlice(config.vantaRoot);
      return { status: "verify-failed", workItem: item, reason: verifyResult.reason ?? "unknown" };
    }

    // O11 — clamp the requested level to the most restrictive compartment the
    // slice touched. A brainstem fix can't auto-commit even at L4; only limbs/
    // reflexes/memory reach the full ladder. Skeleton would have failed verify.
    const cap = autonomyCapForFiles(artifact.touchedFiles);
    const effectiveLevel = Math.min(level, cap.maxLevel);
    if (effectiveLevel < level) {
      log(`factory: [O11] ${cap.compartment} compartment caps autonomy at L${cap.maxLevel} — clamping from L${level}`);
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

    // L5 merge — auto-land the slice into the integration branch IFF it passes
    // the low-risk gate (merge.ts). The gate, not the kernel, is the safety story
    // here (git runs outside assess()); it fails closed → otherwise we stay at L4.
    const mergeTarget = resolveMergeTarget(process.env);
    const decision = assessMergeRisk({
      touchedFiles: artifact.touchedFiles,
      diffLineCount: await deps.vcs.lastCommitLineCount(config.vantaRoot),
      allowMerge: Boolean(process.env.VANTA_AUTONOMY_ALLOW_MERGE),
      mergeTarget,
    });
    if (!decision.merge) {
      log(`factory: [L5] not merging — ${decision.reason} (left at L4 push on ${branch})`);
      return { status: "committed", workItem: item, branch, commitSha: sha, tokenSpend: artifact.tokenSpend, pushed: true };
    }

    const merged = await deps.vcs.merge(config.vantaRoot, mergeTarget, branch, startBranch);
    if (!merged) {
      log(`factory: [L5] merge into ${mergeTarget} failed (conflict or missing target) — left at L4 push on ${branch}`);
      return { status: "committed", workItem: item, branch, commitSha: sha, tokenSpend: artifact.tokenSpend, pushed: true };
    }
    log(`factory: [L5] merged ${branch} → ${mergeTarget}`);
    return { status: "merged", workItem: item, branch, commitSha: sha, tokenSpend: artifact.tokenSpend, mergedInto: mergeTarget };
  } finally {
    await releaseLock(config.dataDir);
  }
}
