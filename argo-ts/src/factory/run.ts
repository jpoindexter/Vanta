import { join } from "node:path";
import { triage } from "./triage.js";
import { buildPlan } from "./planner.js";
import { execute } from "./executor.js";
import { verify, listPreExistingFiles } from "./verifier.js";
import { autonomyCapForFiles } from "./compartments.js";
import { assessMergeRisk, resolveMergeTarget } from "./merge.js";
import type { FactoryConfig, CycleResult, AutonomyLevel } from "./types.js";

// --- Pure helpers ---

export type GateInputs = { disabled: boolean; lockExists: boolean; treeDirty: boolean };

export function checkGate(_config: FactoryConfig, inputs: GateInputs): string | null {
  if (inputs.disabled) return "factory disabled (ARGO_FACTORY_DISABLED is set)";
  if (inputs.lockExists) return "another factory cycle is already running (lockfile exists)";
  if (inputs.treeDirty) return "working tree has uncommitted changes — will not run alongside a live session";
  return null;
}

/** Highest ladder rung implemented (L5 auto-merge — gated by ARGO_AUTONOMY_ALLOW_MERGE). */
export const MAX_AUTONOMY_LEVEL = 5;

/**
 * Resolve the factory autonomy level (1–5) from the CLI subcommand + env.
 * `improve`/review is always suggest-only (L1). `approve` reads ARGO_AUTONOMY_LEVEL
 * (default 4 = commit+push, preserving prior behavior); out-of-range clamps into 1–5.
 * Note: requesting L5 only auto-merges when ARGO_AUTONOMY_ALLOW_MERGE is also set and
 * the slice passes the low-risk gate (merge.ts) — otherwise it lands at L4 push.
 */
export function resolveAutonomyLevel(sub: string, env: NodeJS.ProcessEnv): AutonomyLevel {
  if (sub === "review" || sub === "") return 1;
  const raw = Number(env.ARGO_AUTONOMY_LEVEL);
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

async function isTreeDirty(root: string): Promise<boolean> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  // --untracked-files=no: only flag tracked files with uncommitted edits.
  // Untracked artifacts (handoff docs, temp files) should not block the factory.
  const { stdout } = await promisify(execFile)("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root });
  return stdout.trim().length > 0;
}

async function createBranch(root: string): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16).replace("T", "-");
  const branch = `factory/auto-${ts}`;
  await exec("git", ["checkout", "-b", branch], { cwd: root });
  return branch;
}

async function commitSlice(root: string, message: string): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);
  await exec("git", ["add", "-A"], { cwd: root });
  await exec("git", ["commit", "-m", message], { cwd: root });
  const { stdout } = await exec("git", ["rev-parse", "HEAD"], { cwd: root });
  return stdout.trim().slice(0, 7);
}

async function pushBranch(root: string): Promise<void> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);
  await exec("git", ["push", "-u", "origin", "HEAD"], { cwd: root }).catch(() => {
    /* non-fatal: no remote configured */
  });
}

/** The branch HEAD is on right now (so we can restore it after a merge). */
async function currentBranch(root: string): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { stdout } = await promisify(execFile)("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root });
  return stdout.trim();
}

/** Changed lines (added + deleted) in the most recent commit (the slice). */
async function lastCommitLineCount(root: string): Promise<number> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { stdout } = await promisify(execFile)("git", ["show", "--numstat", "--format=", "HEAD"], { cwd: root });
  let total = 0;
  for (const line of stdout.trim().split("\n")) {
    const [add, del] = line.split("\t");
    total += (Number(add) || 0) + (Number(del) || 0); // "-" (binary) → 0
  }
  return total;
}

/**
 * Merge `sourceBranch` into `target` with --no-ff (never force), then restore the
 * original branch. Returns true on a clean merge. Fails closed: a missing target
 * or a conflict aborts and returns false (the caller stays at L4 push).
 */
async function mergeIntoTarget(root: string, target: string, sourceBranch: string, restoreTo: string): Promise<boolean> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);
  try {
    // Target must already exist — creating an integration branch is itself a
    // mutation the operator should make deliberately (it's the opt-in landing zone).
    await exec("git", ["rev-parse", "--verify", target], { cwd: root });
    await exec("git", ["checkout", target], { cwd: root });
    await exec("git", ["merge", "--no-ff", "--no-edit", sourceBranch], { cwd: root });
    await exec("git", ["checkout", restoreTo], { cwd: root }).catch(() => {});
    return true;
  } catch {
    // Abort any half-done merge and return to where we were.
    await exec("git", ["merge", "--abort"], { cwd: root }).catch(() => {});
    await exec("git", ["checkout", restoreTo], { cwd: root }).catch(() => {});
    return false;
  }
}

async function discardSlice(root: string): Promise<void> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);
  await exec("git", ["checkout", "."], { cwd: root }).catch(() => {});
  await exec("git", ["clean", "-fd", "--", "argo-ts/src"], { cwd: root }).catch(() => {});
}

/**
 * Run one complete factory cycle: gate → triage → branch → plan → execute → verify → commit.
 * In review mode, prints the plan and exits for human approval (run `argo factory approve` to proceed).
 */
export async function runCycle(config: FactoryConfig, log: (msg: string) => void = console.log): Promise<CycleResult> {
  const treeDirty = await isTreeDirty(config.argoRoot);
  const acquired = await acquireLock(config.dataDir);
  const lockExists = !acquired;
  const disabled = Boolean(process.env.ARGO_FACTORY_DISABLED);

  const bail = checkGate(config, { disabled, lockExists, treeDirty });
  if (bail) {
    if (acquired) await releaseLock(config.dataDir);
    return { status: "aborted", reason: bail };
  }

  try {
    log("factory: triaging backlog…");
    const item = await triage(config.argoRoot);
    if (!item) return { status: "nothing-to-do" };
    log(`factory: [${item.category}] ${item.description}`);

    const plan = buildPlan(item, config.argoRoot);
    if (config.interactive) log(`\nPlan:\n${plan.instruction}\n`);

    const level = config.autonomyLevel;

    if (level <= 1) {
      // L1 suggest — print the plan, change nothing (no branch).
      log(`[L1 suggest] Run 'argo factory approve' to implement this plan.`);
      return { status: "aborted", reason: "suggest mode (L1) — awaiting approval (run: argo factory approve)" };
    }

    const preExisting = await listPreExistingFiles(config.argoRoot);
    const startBranch = await currentBranch(config.argoRoot);
    const branch = await createBranch(config.argoRoot);
    log(`factory: branched → ${branch}`);

    // FAC-STALL: bounded retry when verify fails (ARGO_FACTORY_MAX_RETRIES, default 1).
    const maxRetries = Math.max(0, parseInt(process.env.ARGO_FACTORY_MAX_RETRIES ?? "1", 10));
    let artifact = await execute(config.argoRoot, plan, config.budgetTokens);
    log(`factory: executing… ${artifact.touchedFiles.length} file(s) touched, ~${artifact.tokenSpend.toLocaleString()} tokens`);
    let verifyResult = await verify(config.argoRoot, artifact, preExisting, { workItem: item });
    for (let retry = 1; !verifyResult.ok && retry <= maxRetries; retry++) {
      log(`factory: stall — verify-fail (${verifyResult.reason}) — retrying (${retry}/${maxRetries})…`);
      await discardSlice(config.argoRoot);
      const retryBranch = await createBranch(config.argoRoot);
      log(`factory: branched → ${retryBranch}`);
      const retryInstruction = `${plan.instruction}\n\n[Retry ${retry}] Previous attempt failed: ${verifyResult.reason}. Try a different approach.`;
      artifact = await execute(config.argoRoot, { ...plan, instruction: retryInstruction }, config.budgetTokens);
      log(`factory: retry ${retry}: ${artifact.touchedFiles.length} file(s), ~${artifact.tokenSpend.toLocaleString()} tokens`);
      verifyResult = await verify(config.argoRoot, artifact, preExisting, { workItem: item });
    }
    if (!verifyResult.ok) {
      log(`factory: verification failed — ${verifyResult.reason}`);
      await discardSlice(config.argoRoot);
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
    const sha = await commitSlice(config.argoRoot, msg);
    log(`factory: committed ${sha}`);
    // FAC-CLOSE: mark the roadmap item shipped so the KANBAN reflects the close.
    if (item.roadmapId && item.category === "roadmap") {
      const { moveRoadmapItem } = await import("../roadmap/move.js");
      await moveRoadmapItem(config.argoRoot, item.roadmapId, "shipped").catch(() => {});
      log(`factory: closed roadmap item ${item.roadmapId}`);
    }

    if (effectiveLevel <= 3) {
      // L3 commit — committed locally, but not pushed.
      return { status: "committed", workItem: item, branch, commitSha: sha, tokenSpend: artifact.tokenSpend, pushed: false };
    }

    // L4 push — publish the branch.
    await pushBranch(config.argoRoot);
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
      diffLineCount: await lastCommitLineCount(config.argoRoot),
      allowMerge: Boolean(process.env.ARGO_AUTONOMY_ALLOW_MERGE),
      mergeTarget,
    });
    if (!decision.merge) {
      log(`factory: [L5] not merging — ${decision.reason} (left at L4 push on ${branch})`);
      return { status: "committed", workItem: item, branch, commitSha: sha, tokenSpend: artifact.tokenSpend, pushed: true };
    }

    const merged = await mergeIntoTarget(config.argoRoot, mergeTarget, branch, startBranch);
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
