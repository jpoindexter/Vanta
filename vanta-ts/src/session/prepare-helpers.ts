import { join } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { buildSystemPrompt } from "../prompt.js";
import { applyCacheHints } from "../prompt/cache-hints.js";
import { selectSkillsForTask } from "../skills/select.js";
import { recentMemory } from "../memory/store.js";
import { listSkills } from "../skills/store.js";
import { resolveBrain } from "../brain/interface.js";
import { readSessionMemory, sessionMemoryBlock } from "../memory/session-memory.js";
import { learningsDigest } from "../learnings/relevance.js";
import { playbookDigest } from "../memory/playbook.js";
import { getOutputDensity } from "../nd/profile.js";
import { loadSettings, type Settings } from "../settings/store.js";
import { gitInstructionsBlock } from "../settings/git-settings.js";
import { beliefPromptBlock } from "../operator-profile/behavior.js";
import { resolveProjectTrust, type TrustConfirmer } from "../settings/trust-gate.js";
import { fireHooks } from "../hooks/shell-hooks.js";
import { resolveIsolation, skipSkills, skipHooks, skipMemory, skipProjectContext, skipSettings } from "../cli/isolation.js";
import { sessionConfig, sessionConfigEvent } from "../sessions/config-event.js";
import { formatRalphContinuityBlock, hasIncompleteRalphWork, readRalphState } from "../ralph/state.js";
import type { LLMProvider } from "../providers/interface.js";
import type { Goal } from "../types.js";
import type { buildRegistry } from "../tools/index.js";
import type { KernelClient } from "../kernel/client.js";

// Runtime extensions (settings env apply + MCP servers / plugins / MCP skills
// mounting) are a distinct sub-concern — moved to ./runtime-extensions.ts and
// re-exported so prepareRun's import surface stays unchanged.
export { loadRuntimeSettings, loadRuntimeExtensions } from "./runtime-extensions.js";

type PromptContext = {
  memory: string;
  skills: { name: string; description: string }[];
  brain: string;
  selfContent: string;
  moimNote: string | undefined;
  errorsLog: string | undefined;
  program: string | undefined;
  projectId: string | undefined;
};

export async function loadPromptContext(repoRoot: string, activeGoalIds: number[]): Promise<PromptContext> {
  const isolation = resolveIsolation(process.env);
  if (skipMemory(isolation)) {
    return {
      memory: "",
      skills: [],
      brain: "",
      selfContent: "",
      moimNote: undefined,
      errorsLog: undefined,
      program: undefined,
      projectId: undefined,
    };
  }
  const memory = await recentMemory(activeGoalIds);
  // VANTA-SAFE-MODE: safe-mode + bare skip skills (install + index). Skipped →
  // empty skill index, same shape as a fresh store with no skills.
  const skills = skipSkills(resolveIsolation(process.env)) ? [] : await loadSkillIndex();
  const [brainDigest, beliefs] = await Promise.all([
    resolveBrain(process.env).digest(process.env).catch(() => ""),
    beliefPromptBlock(process.env).catch(() => ""),
  ]);
  const brain = [brainDigest, beliefs].filter((part) => part.trim()).join("\n\n");
  const { selfDigest } = await import("../self/store.js");
  const selfContent = await selfDigest(process.env).catch(() => "");
  const { readMoim } = await import("../moim/store.js");
  const moimNote = await readMoim(process.env).catch(() => undefined);
  const errorsLog = await readFile(join(repoRoot, "ERRORS.md"), "utf8").catch(() => undefined);
  const program = process.env.VANTA_PROGRAM_OVERRIDE ?? await readFile(join(repoRoot, "PROGRAM.md"), "utf8").catch(() => undefined);
  const { canonicalProjectId } = await import("../projects/identity.js");
  const projectId = await canonicalProjectId(repoRoot).catch(() => undefined);
  return { memory, skills, brain, selfContent, moimNote, errorsLog, program, projectId };
}

/** Install the bundled skill library + read the skill index (name + description). */
async function loadSkillIndex(): Promise<{ name: string; description: string }[]> {
  const { installSkillLibrary } = await import("../skills/library.js");
  await installSkillLibrary({ env: process.env }).catch(() => {});
  // SKILL-TRIGGERS: (re)register declared triggers into ~/.vanta/hooks.json (user
  // scope, idempotent). Best-effort — never blocks session start.
  const { syncSkillTriggers } = await import("../skills/triggers-sync.js");
  await syncSkillTriggers({ env: process.env }).catch(() => {});
  return (await listSkills(process.env).catch(() => [])).map((s) => ({
    name: s.meta.name,
    description: s.meta.description,
  }));
}

async function recentlyWritten(path: string, maxAgeMs: number): Promise<boolean> {
  if (maxAgeMs <= 0) return false;
  try {
    const s = await stat(path);
    return Date.now() - s.mtimeMs <= maxAgeMs;
  } catch {
    return false;
  }
}

export async function injectResume(systemPrompt: string, repoRoot: string): Promise<string> {
  if (skipMemory(resolveIsolation(process.env))) return systemPrompt;
  const { readAutoHandoff, clearAutoHandoff } = await import("../repl/auto-handoff.js");
  const dataDir = join(repoRoot, ".vanta");
  const maxAgeMs = (Number(process.env.VANTA_RESUME_MAX_AGE_MIN ?? 120) || 0) * 60_000;
  if (await recentlyWritten(join(dataDir, "handoff.md"), maxAgeMs)) {
    const resume = await readAutoHandoff(dataDir).catch(() => null);
    if (resume) {
      systemPrompt += `\n\nResume from your last session (auto-saved when context filled up — continue from here; don't re-ask the user for state):\n${resume}`;
      await clearAutoHandoff(dataDir);
    }
  }
  if (await recentlyWritten(join(dataDir, "session-memory.md"), maxAgeMs)) {
    const scratch = await readSessionMemory(dataDir).catch(() => "");
    if (scratch.trim()) systemPrompt += `\n\n${sessionMemoryBlock(scratch)}`;
  }
  // LEARNINGS-INDEX: surface the most relevant project learnings (stale/conflicting
  // flagged) so a session starts with them in context. Best-effort — never blocks
  // startup (digest swallows its own errors; the await is additionally guarded).
  const learnings = await learningsDigest(dataDir, repoRoot).catch(() => "");
  if (learnings.trim()) systemPrompt += `\n\n${learnings}`;
  return systemPrompt;
}

/**
 * VANTA-SAFE-MODE: whether the project's context files (CLAUDE.md/rules) load.
 * safe-mode + bare skip context → false (no trust prompt, no context tier).
 * Neither flag → the normal trust gate decides. Pure over env + the trust store.
 */
export async function resolveLoadContext(
  repoRoot: string,
  confirmTrust: TrustConfirmer | undefined,
  settings: Settings,
): Promise<boolean> {
  if (skipProjectContext(resolveIsolation(process.env))) return false;
  return resolveProjectTrust(repoRoot, confirmTrust, { env: process.env, settings });
}

/**
 * VANTA-SAFE-MODE: fire the InstructionsLoaded lifecycle hooks unless safe-mode
 * is active (safe-mode skips ALL user customizations incl. hooks). bare keeps
 * hooks. Neither flag → fires unchanged.
 */
export async function fireInstructionsLoaded(
  repoRoot: string,
  instruction: string,
  provider: LLMProvider,
): Promise<void> {
  if (skipHooks(resolveIsolation(process.env))) return;
  await fireHooks(
    join(repoRoot, ".vanta"),
    "InstructionsLoaded",
    { reason: "session_start", instruction },
    { cwd: repoRoot, matcherValue: "session_start", promptProvider: provider },
  );
}

export function logSessionConfig(
  safety: { logEvent: (e: string) => Promise<void> },
  provider: { modelId: () => string; contextWindow: () => number },
  registry: { schemas: () => unknown[] },
  systemPrompt: string,
): void {
  const cfg = sessionConfig({ provider: process.env.VANTA_PROVIDER ?? "unknown", model: provider.modelId(), contextWindow: provider.contextWindow(), tools: registry.schemas().length, systemPrompt });
  void safety.logEvent(sessionConfigEvent(cfg, new Date().toISOString()));
}

export async function buildRunPrompt(o: {
  repoRoot: string;
  instruction: string;
  goals: Goal[];
  registry: ReturnType<typeof buildRegistry>;
  activeIds: number[];
  /** VANTA-TRUST-DIALOG: false → untrusted project, context files are not loaded. */
  loadContext?: boolean;
}): Promise<{ systemPrompt: string; ralphContinuity?: string }> {
  const isolation = resolveIsolation(process.env);
  const ctx = await loadPromptContext(o.repoRoot, o.activeIds);
  const playbook = skipMemory(isolation) ? "" : await playbookDigest(o.instruction).catch(() => "");
  const ralphContinuity = skipMemory(isolation) ? undefined : await loadRalphContinuity(o.repoRoot);
  // Task-condition the skill index for a real one-shot task (interactive keeps the full
  // index → stable cached prefix). Opt out with VANTA_SKILL_SUBSET=0.
  const skills = process.env.VANTA_SKILL_SUBSET === "0"
    ? ctx.skills
    : selectSkillsForTask(ctx.skills ?? [], o.instruction);
  const settings = skipSettings(isolation) ? {} : await loadSettings(o.repoRoot, process.env);
  const systemPrompt = await buildSystemPrompt({
    root: o.repoRoot,
    soulPath: join(o.repoRoot, "SOUL.md"),
    goals: o.goals,
    tools: o.registry.schemas(),
    now: new Date().toISOString(),
    memory: ctx.memory,
    moimNote: ctx.moimNote,
    skills,
    brain: ctx.brain,
    errorsLog: ctx.errorsLog,
    projectId: ctx.projectId,
    selfContent: ctx.selfContent,
    program: ctx.program,
    playbook,
    ralphContinuity,
    goalsPaused: process.env.VANTA_GOAL_RESUME !== "auto",
    loadContext: o.loadContext,
    outputDensity: skipSettings(isolation) ? undefined : await getOutputDensity(),
    gitInstructions: gitInstructionsBlock(settings),
  });
  // VANTA-CACHE-HINTS: opt-in (VANTA_EXCLUDE_DYNAMIC_PROMPT/VANTA_CACHE_HINTS=1)
  // drops the volatile tail so the prompt stays cacheable across turns. Off by
  // default → full prompt unchanged. Trades per-turn freshness for cache hits.
  return { systemPrompt: applyCacheHints(systemPrompt, process.env), ralphContinuity };
}

export async function loadRalphContinuity(repoRoot: string): Promise<string | undefined> {
  const state = await readRalphState(join(repoRoot, ".vanta"));
  return state && hasIncompleteRalphWork(state) ? formatRalphContinuityBlock(state) : undefined;
}
