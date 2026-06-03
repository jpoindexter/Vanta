import { join } from "node:path";
import { triage } from "./triage.js";
import { buildPlan } from "./planner.js";
import { execute } from "./executor.js";
import { verify, listPreExistingFiles } from "./verifier.js";
import { autonomyCapForFiles } from "./compartments.js";
import type { FactoryConfig, CycleResult, AutonomyLevel } from "./types.js";

// --- Pure helpers ---

export type GateInputs = { disabled: boolean; lockExists: boolean; treeDirty: boolean };

export function checkGate(_config: FactoryConfig, inputs: GateInputs): string | null {
  if (inputs.disabled) return "factory disabled (ARGO_FACTORY_DISABLED is set)";
  if (inputs.lockExists) return "another factory cycle is already running (lockfile exists)";
  if (inputs.treeDirty) return "working tree has uncommitted changes — will not run alongside a live session";
  return null;
}

/** Highest ladder rung implemented today (L5 auto-merge is reserved). */
export const MAX_AUTONOMY_LEVEL = 4;

/**
 * Resolve the factory autonomy level (1–4) from the CLI subcommand + env.
 * `improve`/review is always suggest-only (L1). `approve` reads ARGO_AUTONOMY_LEVEL
 * (default 4 = commit+push, preserving prior behavior); out-of-range clamps into 1–4.
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
    const branch = await createBranch(config.argoRoot);
    log(`factory: branched → ${branch}`);

    log("factory: executing…");
    const artifact = await execute(config.argoRoot, plan, config.budgetTokens);
    log(`factory: ${artifact.touchedFiles.length} file(s) touched, ~${artifact.tokenSpend.toLocaleString()} tokens`);

    log("factory: verifying…");
    const verifyResult = await verify(config.argoRoot, artifact, preExisting);
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

    if (effectiveLevel <= 3) {
      // L3 commit — committed locally, but not pushed.
      return { status: "committed", workItem: item, branch, commitSha: sha, tokenSpend: artifact.tokenSpend, pushed: false };
    }

    // L4 push — publish the branch (no merge; L5 reserved for O10b).
    await pushBranch(config.argoRoot);
    log(`factory: pushed ${branch}`);
    return { status: "committed", workItem: item, branch, commitSha: sha, tokenSpend: artifact.tokenSpend, pushed: true };
  } finally {
    await releaseLock(config.dataDir);
  }
}
