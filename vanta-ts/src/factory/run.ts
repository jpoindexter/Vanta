import { join } from "node:path";
import { triage } from "./triage.js";
import { buildPlan, augmentPlanWithCodeIntel } from "./planner.js";
import { resolveCodeIntel } from "../code-intel/index.js";
import { execute } from "./executor.js";
import { verify, listPreExistingFiles } from "./verifier.js";
import { shouldClarify, buildPrefightNote } from "./preflight.js";
import { defaultVcs } from "./vcs.js";
import { executeWithVerify, landVerifiedSlice, type CycleCtx } from "./run-stages.js";
import type { FactoryConfig, CycleResult, AutonomyLevel, FactoryDeps, FactoryPlan, WorkItem } from "./types.js";
import type { CodeIntelProvider } from "../code-intel/provider.js";

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
 * CODE-INTEL-FACTORY-WIRING — build the slice plan, augmented with a code map when code
 * intelligence is available (an absent/unavailable engine leaves the plan unchanged). Returns
 * the provider too, so the verify gate's affected-tests fast-check can reuse it.
 */
async function preparePlan(
  config: FactoryConfig,
  item: WorkItem,
  deps: FactoryDeps,
): Promise<{ plan: FactoryPlan; codeIntel: CodeIntelProvider }> {
  const codeIntel = resolveCodeIntel(config.vantaRoot, process.env);
  const plan = await augmentPlanWithCodeIntel(deps.plan(item, config.vantaRoot), codeIntel);
  return { plan, codeIntel };
}

/** Acquire the lock then run the pre-cycle gate; reports whether we hold the lock + a bail reason. */
async function enterGate(config: FactoryConfig, deps: FactoryDeps): Promise<{ acquired: boolean; bail: string | null }> {
  const acquired = await acquireLock(config.dataDir);
  const bail = checkGate(config, {
    disabled: Boolean(process.env.VANTA_FACTORY_DISABLED),
    lockExists: !acquired,
    treeDirty: await deps.vcs.isTreeDirty(config.vantaRoot),
  });
  return { acquired, bail };
}

/**
 * Run one complete factory cycle: gate → triage → branch → plan → execute → verify → commit.
 * In review mode, prints the plan and exits for human approval (run `vanta factory approve` to proceed).
 * The execute→verify→land pipeline lives in run-stages.ts.
 */
export async function runCycle(
  config: FactoryConfig,
  log: (msg: string) => void = console.log,
  deps: FactoryDeps = defaultFactoryDeps,
): Promise<CycleResult> {
  const { acquired, bail } = await enterGate(config, deps);
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

    // CODE-INTEL-FACTORY-WIRING: build with a code map when code intelligence is available;
    // an absent/unavailable engine leaves the plan unchanged (blind build, exactly as before).
    const { plan, codeIntel } = await preparePlan(config, item, deps);
    if (config.interactive) log(`\nPlan:\n${plan.instruction}\n`);
    if (config.autonomyLevel <= 1) {
      // L1 suggest — print the plan, change nothing (no branch).
      log(`[L1 suggest] Run 'vanta factory approve' to implement this plan.`);
      return { status: "aborted", reason: "suggest mode (L1) — awaiting approval (run: vanta factory approve)" };
    }

    const preExisting = await listPreExistingFiles(config.vantaRoot);
    const startBranch = await deps.vcs.currentBranch(config.vantaRoot);
    const branch = await deps.vcs.createBranch(config.vantaRoot);
    log(`factory: branched → ${branch}`);

    const ctx: CycleCtx = { config, item, deps, log, codeIntel };
    const result = await executeWithVerify(ctx, plan, preExisting);
    if (!result.ok) {
      log(`factory: verification failed — ${result.reason}`);
      await deps.vcs.discardSlice(config.vantaRoot);
      return { status: "verify-failed", workItem: item, reason: result.reason ?? "unknown" };
    }
    return await landVerifiedSlice(ctx, branch, startBranch, result.artifact);
  } finally {
    await releaseLock(config.dataDir);
  }
}
