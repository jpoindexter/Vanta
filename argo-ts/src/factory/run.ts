import { join } from "node:path";
import { triage } from "./triage.js";
import { buildPlan } from "./planner.js";
import { execute } from "./executor.js";
import { verify, listPreExistingFiles } from "./verifier.js";
import type { FactoryConfig, CycleResult } from "./types.js";

// --- Pure helpers ---

export type GateInputs = { disabled: boolean; lockExists: boolean; treeDirty: boolean };

export function checkGate(_config: FactoryConfig, inputs: GateInputs): string | null {
  if (inputs.disabled) return "factory disabled (ARGO_FACTORY_DISABLED is set)";
  if (inputs.lockExists) return "another factory cycle is already running (lockfile exists)";
  if (inputs.treeDirty) return "working tree has uncommitted changes — will not run alongside a live session";
  return null;
}

export function formatCycleLog(result: CycleResult): string {
  switch (result.status) {
    case "nothing-to-do":
      return "factory: nothing to do — backlog is clean";
    case "aborted":
      return `factory: aborted — ${result.reason}`;
    case "verify-failed":
      return `factory: verify-failed — ${result.reason} (work discarded, no history entry)`;
    case "committed":
      return `factory: committed ${result.commitSha} on ${result.branch} (${result.tokenSpend.toLocaleString()} tokens) — ${result.workItem.description}`;
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
  const { stdout } = await promisify(execFile)("git", ["status", "--porcelain"], { cwd: root });
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

async function commitAndPush(root: string, message: string): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);
  await exec("git", ["add", "-A"], { cwd: root });
  await exec("git", ["commit", "-m", message], { cwd: root });
  const { stdout } = await exec("git", ["rev-parse", "HEAD"], { cwd: root });
  const sha = stdout.trim().slice(0, 7);
  await exec("git", ["push", "-u", "origin", "HEAD"], { cwd: root }).catch(() => {
    /* non-fatal: no remote configured */
  });
  return sha;
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

    const preExisting = await listPreExistingFiles(config.argoRoot);
    const branch = await createBranch(config.argoRoot);
    log(`factory: branched → ${branch}`);

    const plan = buildPlan(item, config.argoRoot);
    if (config.interactive) log(`\nPlan:\n${plan.instruction}\n`);

    if (config.autonomy === "review") {
      log(`[review mode] Run 'argo factory approve' to execute this plan.`);
      return { status: "aborted", reason: "review mode — awaiting approval (run: argo factory approve)" };
    }

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

    const msg = `factory(auto): ${item.description}\n\ncategory: ${item.category}\ntokens: ${artifact.tokenSpend.toLocaleString()}\nbranch: ${branch}`;
    const sha = await commitAndPush(config.argoRoot, msg);
    log(`factory: committed ${sha}`);
    return { status: "committed", workItem: item, branch, commitSha: sha, tokenSpend: artifact.tokenSpend };
  } finally {
    await releaseLock(config.dataDir);
  }
}
