import { join } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { buildSystemPrompt } from "../prompt.js";
import { recentMemory } from "../memory/store.js";
import { listSkills } from "../skills/store.js";
import { resolveBrain } from "../brain/index.js";
import { readSessionMemory, sessionMemoryBlock } from "../memory/session-memory.js";
import { playbookDigest } from "../memory/playbook.js";
import { mountMcpServers } from "../mcp/mount.js";
import type { Settings } from "../settings/store.js";
import { PluginCommandRegistry } from "../plugins/commands.js";
import { sessionConfig, sessionConfigEvent } from "../sessions/config-event.js";
import { formatRalphContinuityBlock, hasIncompleteRalphWork, readRalphState } from "../ralph/state.js";
import type { LLMProvider } from "../providers/interface.js";
import type { Goal } from "../types.js";
import type { buildRegistry } from "../tools/index.js";
import type { SafetyClient } from "../safety-client.js";

type PromptContext = {
  memory: string;
  skills: { name: string; description: string }[];
  brain: string;
  selfContent: string;
  moimNote: string | undefined;
  errorsLog: string | undefined;
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
  const brain = await resolveBrain().digest(process.env).catch(() => "");
  const { selfDigest } = await import("../self/store.js");
  const selfContent = await selfDigest(process.env).catch(() => "");
  const { readMoim } = await import("../moim/store.js");
  const moimNote = await readMoim(process.env).catch(() => undefined);
  const errorsLog = await readFile(join(repoRoot, "ERRORS.md"), "utf8").catch(() => undefined);
  const { canonicalProjectId } = await import("../projects/identity.js");
  const projectId = await canonicalProjectId(repoRoot).catch(() => undefined);
  return { memory, skills, brain, selfContent, moimNote, errorsLog, projectId };
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
  return systemPrompt;
}

export async function loadRuntimeExtensions(
  repoRoot: string,
  registry: ReturnType<typeof buildRegistry>,
): Promise<{ settings: Settings; pluginCommands: PluginCommandRegistry }> {
  const { loadSettings, applySettingsEnv } = await import("../settings/store.js");
  const settings = await loadSettings(repoRoot, process.env).catch(() => ({}));
  applySettingsEnv(settings, process.env);
  await mountMcpServers(registry, process.env, (m) => console.log(m));
  const { SLASH_COMMANDS } = await import("../repl/catalog.js");
  const pluginCommands = new PluginCommandRegistry(new Set(SLASH_COMMANDS.map((c) => c.name)));
  const { loadEnabledPlugins } = await import("../plugins/loader.js");
  await loadEnabledPlugins({ repoRoot, registry, commands: pluginCommands, settings, env: process.env, log: (m) => console.log(m) });
  return { settings, pluginCommands };
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
}): Promise<{ systemPrompt: string; ralphContinuity?: string }> {
  const ctx = await loadPromptContext(o.repoRoot, o.activeIds);
  const playbook = await playbookDigest(o.instruction).catch(() => "");
  const ralphContinuity = await loadRalphContinuity(o.repoRoot);
  const systemPrompt = await buildSystemPrompt({
    root: o.repoRoot,
    soulPath: join(o.repoRoot, "SOUL.md"),
    goals: o.goals,
    tools: o.registry.schemas(),
    now: new Date().toISOString(),
    memory: ctx.memory,
    moimNote: ctx.moimNote,
    skills: ctx.skills,
    brain: ctx.brain,
    errorsLog: ctx.errorsLog,
    projectId: ctx.projectId,
    selfContent: ctx.selfContent,
    playbook,
    ralphContinuity,
    goalsPaused: process.env.VANTA_GOAL_RESUME !== "auto",
  });
  return { systemPrompt, ralphContinuity };
}

export async function loadRalphContinuity(repoRoot: string): Promise<string | undefined> {
  const state = await readRalphState(join(repoRoot, ".vanta"));
  return state && hasIncompleteRalphWork(state) ? formatRalphContinuityBlock(state) : undefined;
}
