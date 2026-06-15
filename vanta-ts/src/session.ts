import { join } from "node:path";
import { readFile, stat } from "node:fs/promises";
import type { Interface as Readline } from "node:readline/promises";
import { SafetyClient } from "./safety-client.js";
import { ensureKernel } from "./kernel-launcher.js";
import { buildRegistry } from "./tools/index.js";
import { buildSystemPrompt } from "./prompt.js";
import { recentMemory, appendMemory } from "./memory/store.js";
import { resolveRoutedProvider } from "./routing/model-router.js";
import { listSkills } from "./skills/store.js";
import { brainDigest } from "./brain/brain.js";
import { readSessionMemory, sessionMemoryBlock } from "./memory/session-memory.js";
import { installMessageDisplayHooks } from "./agent/message-display.js";
import { playbookDigest } from "./memory/playbook.js";
import { globalHookBus } from "./plugins/hooks.js";
import { PluginCommandRegistry } from "./plugins/commands.js";
import { mountMcpServers } from "./mcp/mount.js";
import type { Settings } from "./settings/store.js";
import type { LLMProvider } from "./providers/interface.js";
import { sessionConfig, sessionConfigEvent } from "./sessions/config-event.js";
import type { Summarizer } from "./context.js";
import type { Goal } from "./types.js";

// Post-turn gates (reviewAfterTurn, the EF detectors, …) live in
// ./session/after-turn.js; the console printers (consoleCallbacks) in
// ./session/console-callbacks.js; the curator scheduler (maybeCurate) in
// ./session/curate.js — all re-exported here so the hosts keep importing them
// from "./session.js" unchanged.
export * from "./session/after-turn.js";
export * from "./session/console-callbacks.js";
export * from "./session/curate.js";

// Shared run setup used by both the one-shot CLI (`vanta run`) and the
// interactive session (`vanta` / `vanta chat`). Kept here so neither imports the
// other's module (cli.ts self-executes main()).

export type RunSetup = {
  safety: SafetyClient;
  registry: ReturnType<typeof buildRegistry>;
  pluginCommands: PluginCommandRegistry;
  provider: LLMProvider;
  goals: Goal[];
  systemPrompt: string;
};

/**
 * Ensure the kernel is up and assemble a run. `instruction` drives multi-model
 * routing (a no-op when no cheap/expensive model is set).
 */
type PromptContext = {
  memory: string;
  skills: { name: string; description: string }[];
  brain: string;
  selfContent: string;
  moimNote: string | undefined;
  errorsLog: string | undefined;
  projectId: string | undefined;
};

async function loadPromptContext(repoRoot: string, activeGoalIds: number[]): Promise<PromptContext> {
  const memory = await recentMemory(activeGoalIds);
  const { installSkillLibrary } = await import("./skills/library.js");
  await installSkillLibrary({ env: process.env }).catch(() => {});
  const skills = (await listSkills(process.env).catch(() => [])).map((s) => ({
    name: s.meta.name,
    description: s.meta.description,
  }));
  const brain = await brainDigest(process.env).catch(() => "");
  const { selfDigest } = await import("./self/store.js");
  const selfContent = await selfDigest(process.env).catch(() => "");
  const { readMoim } = await import("./moim/store.js");
  const moimNote = await readMoim(process.env).catch(() => undefined);
  const errorsLog = await readFile(join(repoRoot, "ERRORS.md"), "utf8").catch(() => undefined);
  const { canonicalProjectId } = await import("./projects/identity.js");
  const projectId = await canonicalProjectId(repoRoot).catch(() => undefined);
  return { memory, skills, brain, selfContent, moimNote, errorsLog, projectId };
}

/** True if `path` was modified within `maxAgeMs` (0/negative = never resume). */
async function recentlyWritten(path: string, maxAgeMs: number): Promise<boolean> {
  if (maxAgeMs <= 0) return false;
  try {
    const s = await stat(path);
    return Date.now() - s.mtimeMs <= maxAgeMs;
  } catch {
    return false;
  }
}

// Carry the prior thread (auto-handoff + session-memory) into a restart ONLY when
// it was recent — a fresh start hours later should be clean, not stuck on a stale
// goal/thread. Window: VANTA_RESUME_MAX_AGE_MIN (default 120; 0 disables resume).
async function injectResume(systemPrompt: string, repoRoot: string): Promise<string> {
  const { readAutoHandoff, clearAutoHandoff } = await import("./repl/auto-handoff.js");
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

async function loadRuntimeExtensions(
  repoRoot: string,
  registry: ReturnType<typeof buildRegistry>,
): Promise<{ settings: Settings; pluginCommands: PluginCommandRegistry }> {
  const { loadSettings, applySettingsEnv } = await import("./settings/store.js");
  const settings = await loadSettings(repoRoot, process.env).catch(() => ({}));
  applySettingsEnv(settings, process.env);
  await mountMcpServers(registry, process.env, (m) => console.log(m));
  const { SLASH_COMMANDS } = await import("./repl/catalog.js");
  const pluginCommands = new PluginCommandRegistry(new Set(SLASH_COMMANDS.map((c) => c.name)));
  const { loadEnabledPlugins } = await import("./plugins/loader.js");
  await loadEnabledPlugins({ repoRoot, registry, commands: pluginCommands, settings, env: process.env, log: (m) => console.log(m) });
  return { settings, pluginCommands };
}

/** Best-effort: log the resolved session config to events.jsonl for reproducibility. */
function logSessionConfig(safety: { logEvent: (e: string) => Promise<void> }, provider: { modelId: () => string; contextWindow: () => number }, registry: { schemas: () => unknown[] }, systemPrompt: string): void {
  const cfg = sessionConfig({ provider: process.env.VANTA_PROVIDER ?? "unknown", model: provider.modelId(), contextWindow: provider.contextWindow(), tools: registry.schemas().length, systemPrompt });
  void safety.logEvent(sessionConfigEvent(cfg, new Date().toISOString()));
}

export async function prepareRun(
  repoRoot: string,
  instruction: string,
  skillBody?: string,
): Promise<RunSetup> {
  const baseUrl = process.env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788";
  const kernelBin = join(repoRoot, "target", "debug", "vanta-kernel");
  await ensureKernel({ baseUrl, kernelBin, root: repoRoot });

  const safety = new SafetyClient(baseUrl);
  const registry = buildRegistry();
  const { settings, pluginCommands } = await loadRuntimeExtensions(repoRoot, registry);
  const provider = resolveRoutedProvider(process.env, instruction);
  const goals = await safety.getGoals().catch(() => []);
  const activeIds = goals.filter((g) => g.status === "active").map((g) => g.id);

  const { prefetchApiKeyHelper } = await import("./api-key-helper.js");
  await prefetchApiKeyHelper(settings, process.env);
  installMessageDisplayHooks(globalHookBus, process.env);

  const ctx = await loadPromptContext(repoRoot, activeIds);
  const playbook = await playbookDigest(instruction).catch(() => "");
  let systemPrompt = await buildSystemPrompt({
    root: repoRoot,
    soulPath: join(repoRoot, "SOUL.md"),
    goals,
    tools: registry.schemas(),
    now: new Date().toISOString(),
    memory: ctx.memory,
    moimNote: ctx.moimNote,
    skills: ctx.skills,
    brain: ctx.brain,
    errorsLog: ctx.errorsLog,
    projectId: ctx.projectId,
    selfContent: ctx.selfContent,
    playbook,
    // Carried goal starts PAUSED (no silent resume on a fresh launch); VANTA_GOAL_RESUME=auto = old behavior.
    goalsPaused: process.env.VANTA_GOAL_RESUME !== "auto",
  });
  if (skillBody) systemPrompt += `\n\nApply this skill:\n${skillBody}`;
  // AUTO-HANDOFF: on an interactive launch, inject + consume a recent auto-saved
  // resume block so a restart/fresh session continues without a manual handoff.
  if (instruction === "interactive session") {
    systemPrompt = await injectResume(systemPrompt, repoRoot);
  }
  logSessionConfig(safety, provider, registry, systemPrompt); // reproducibility (SELFHARNESS-CONFIG-REPRO)
  return { safety, registry, pluginCommands, provider, goals, systemPrompt };
}

const SUMMARIZE_SYS =
  "Summarize the following conversation messages into a compact paragraph capturing decisions, findings, and open threads. Be terse.";

/** Optionally steer the summary toward what to keep. */
function summarizeSys(instructions?: string): string {
  const focus = instructions?.trim();
  return focus ? `${SUMMARIZE_SYS}\nFocus especially on: ${focus}` : SUMMARIZE_SYS;
}

/** Best-effort history compressor passed to the agent loop (see context.ts). */
export function buildSummarizer(provider: LLMProvider, instructions?: string): Summarizer {
  const sys = summarizeSys(instructions);
  return async (msgs) =>
    (
      await provider.complete(
        [
          { role: "system", content: sys },
          { role: "user", content: JSON.stringify(msgs).slice(0, 12000) },
        ],
        [],
      )
    ).text;
}

/**
 * Record what a turn accomplished toward the first active goal. Best-effort: a
 * failure here must never fail the command.
 */
export async function writeRunMemory(
  o: { provider: LLMProvider; goals: Goal[]; instruction: string; finalText: string; now?: string; sessionId?: string; turnIndex?: number },
): Promise<void> {
  const goal = o.goals.find((g) => g.status === "active");
  if (!goal) return;
  try {
    const sys =
      "In 2-3 sentences, summarize what was accomplished toward the goal. Be specific and terse.";
    const user = `Goal: ${goal.text}\n\nInstruction: ${o.instruction}\n\nResult: ${o.finalText}`;
    const { text } = await o.provider.complete(
      [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      [],
    );
    // MEM-STRUCT: include session + turn context in the memory block so the
    // 3-tier hierarchy (goal > session > turn) is implicit in each entry.
    const structHeader = o.sessionId
      ? `session:${o.sessionId} turn:${o.turnIndex ?? 0}\n`
      : "";
    await appendMemory(goal.id, `${structHeader}${text}`, { now: o.now });
  } catch (err: unknown) {
    console.warn(
      `warn: could not write memory: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Interactive y/n approval bound to a readline interface. */
export function approver(
  rl: Readline,
): (action: string, reason: string) => Promise<boolean> {
  return async (action, reason) => {
    const answer = await rl.question(
      `\n[APPROVAL NEEDED] ${action}\nReason: ${reason}\nApprove? (y/n) `,
    );
    return answer.trim().toLowerCase().startsWith("y");
  };
}
