import { join } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { buildSystemPrompt } from "../prompt.js";
import { selectSkillsForTask } from "../skills/select.js";
import { recentMemory } from "../memory/store.js";
import { listSkills } from "../skills/store.js";
import { resolveBrain } from "../brain/interface.js";
import { readSessionMemory, sessionMemoryBlock } from "../memory/session-memory.js";
import { learningsDigest } from "../learnings/relevance.js";
import { playbookDigest } from "../memory/playbook.js";
import { getOutputDensity } from "../nd/profile.js";
import { mountMcpServers, type McpTrust } from "../mcp/mount.js";
import { mountMcpSkills, type RegisteredMcpSkill } from "../mcp/mount-skills.js";
import type { Settings } from "../settings/store.js";
import { PluginCommandRegistry } from "../plugins/commands.js";
import { sessionConfig, sessionConfigEvent } from "../sessions/config-event.js";
import { formatRalphContinuityBlock, hasIncompleteRalphWork, readRalphState } from "../ralph/state.js";
import type { LLMProvider } from "../providers/interface.js";
import type { Goal } from "../types.js";
import type { buildRegistry } from "../tools/index.js";
import type { KernelClient } from "../kernel/client.js";

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
  const memory = await recentMemory(activeGoalIds);
  const { installSkillLibrary } = await import("../skills/library.js");
  await installSkillLibrary({ env: process.env }).catch(() => {});
  const skills = (await listSkills(process.env).catch(() => [])).map((s) => ({
    name: s.meta.name,
    description: s.meta.description,
  }));
  const brain = await resolveBrain(process.env).digest(process.env).catch(() => "");
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

/** SETTINGS-BLOCKEDTOOLS-ENFORCE: load + apply settings once. prepareRun calls
 *  this BEFORE buildRegistry so it can exclude `settings.blockedTools`. Failure
 *  to read settings degrades to empty (current behavior — env stays untouched). */
export async function loadRuntimeSettings(repoRoot: string): Promise<Settings> {
  const { loadSettings, applySettingsEnv } = await import("../settings/store.js");
  const settings = await loadSettings(repoRoot, process.env).catch(() => ({}));
  applySettingsEnv(settings, process.env);
  return settings;
}

export async function loadRuntimeExtensions(
  repoRoot: string,
  registry: ReturnType<typeof buildRegistry>,
  mcpTrust?: McpTrust,
  /** SETTINGS-BLOCKEDTOOLS-ENFORCE: prepareRun loads + applies settings up front
   *  (so the registry can exclude `blockedTools`) and passes them in to avoid a
   *  second load/apply. Omitted → load here as before (back-compat). */
  preloaded?: Settings,
): Promise<{ settings: Settings; pluginCommands: PluginCommandRegistry; mcpSkills: RegisteredMcpSkill[] }> {
  const settings = preloaded ?? await loadRuntimeSettings(repoRoot);
  await mountMcpServers(registry, process.env, (m) => console.log(m), { cwd: repoRoot, trust: mcpTrust });
  const { SLASH_COMMANDS } = await import("../repl/catalog.js");
  const pluginCommands = new PluginCommandRegistry(new Set(SLASH_COMMANDS.map((c) => c.name)));
  const { loadEnabledPlugins } = await import("../plugins/loader.js");
  await loadEnabledPlugins({ repoRoot, registry, commands: pluginCommands, settings, env: process.env, log: (m) => console.log(m) });
  // MCP-SKILLS: register MCP-provided skills into the same command registry
  // (kernel-gated, opt-in via VANTA_MCP_SKILLS). Best-effort — never fatal.
  const { skills: mcpSkills } = await mountMcpSkills(pluginCommands, process.env, { cwd: repoRoot, log: (m) => console.log(m) })
    .catch(() => ({ skills: [] as RegisteredMcpSkill[], dispose: () => {} }));
  return { settings, pluginCommands, mcpSkills };
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
  const ctx = await loadPromptContext(o.repoRoot, o.activeIds);
  const playbook = await playbookDigest(o.instruction).catch(() => "");
  const ralphContinuity = await loadRalphContinuity(o.repoRoot);
  // Task-condition the skill index for a real one-shot task (interactive keeps the full
  // index → stable cached prefix). Opt out with VANTA_SKILL_SUBSET=0.
  const skills = process.env.VANTA_SKILL_SUBSET === "0"
    ? ctx.skills
    : selectSkillsForTask(ctx.skills ?? [], o.instruction);
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
    outputDensity: await getOutputDensity(),
  });
  return { systemPrompt, ralphContinuity };
}

export async function loadRalphContinuity(repoRoot: string): Promise<string | undefined> {
  const state = await readRalphState(join(repoRoot, ".vanta"));
  return state && hasIncompleteRalphWork(state) ? formatRalphContinuityBlock(state) : undefined;
}
