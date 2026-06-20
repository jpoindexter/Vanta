import { join } from "node:path";
import type { Interface as Readline } from "node:readline/promises";
import { createKernelClient, type KernelClient } from "./kernel/client.js";
import { ensureKernel } from "./kernel-launcher.js";
import { buildRegistry } from "./tools/index.js";
import { appendMemory } from "./memory/store.js";
import { resolveRoutedProvider } from "./routing/model-router.js";
import { resolveAdvisorProvider } from "./agent/advisor.js";
import { installMessageDisplayHooks } from "./agent/message-display.js";
import { globalHookBus } from "./plugins/hooks.js";
import { PluginCommandRegistry } from "./plugins/commands.js";
import type { RegisteredMcpSkill } from "./mcp/mount-skills.js";
import type { LLMProvider } from "./providers/interface.js";
import { resolveEffortLevel } from "./effort.js";
import type { Summarizer } from "./context.js";
import { resolveAuxProvider } from "./routing/aux-map.js";
import { preconnectStartup } from "./net/preconnect.js";
import type { EffortLevel, Goal } from "./types.js";
import {
  loadRuntimeExtensions, loadRuntimeSettings, buildRunPrompt, injectResume, logSessionConfig,
  resolveLoadContext, fireInstructionsLoaded,
} from "./session/prepare-helpers.js";
import { type TrustConfirmer } from "./settings/trust-gate.js";
export { loadRalphContinuity } from "./session/prepare-helpers.js";

export * from "./session/after-turn.js";
export * from "./session/console-callbacks.js";
export * from "./session/curate.js";

export type RunSetup = {
  safety: KernelClient;
  registry: ReturnType<typeof buildRegistry>;
  pluginCommands: PluginCommandRegistry;
  /** MCP-SKILLS: skills provided by connected MCP servers (opt-in; for `/skills`). */
  mcpSkills?: RegisteredMcpSkill[];
  provider: LLMProvider;
  /** Optional stronger read-only model consulted after repeated tool failures (VANTA_ADVISOR_MODEL). */
  advisorProvider?: LLMProvider;
  effortLevel: EffortLevel;
  goals: Goal[];
  systemPrompt: string;
  ralphContinuity?: string;
};

/** VANTA-TRUST-DIALOG: interactive hosts pass a confirmer to gate untrusted project/MCP. */
export type PrepareRunOpts = { confirmTrust?: TrustConfirmer };

/** Ensure the kernel is up and return a client to it. */
async function bootstrapKernel(repoRoot: string): Promise<ReturnType<typeof createKernelClient>> {
  const baseUrl = process.env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788";
  const kernelBin = join(repoRoot, "target", "debug", "vanta-kernel");
  await ensureKernel({ baseUrl, kernelBin, root: repoRoot });
  return createKernelClient(baseUrl);
}

export async function prepareRun(
  repoRoot: string,
  instruction: string,
  skillBody?: string,
  opts: PrepareRunOpts = {},
): Promise<RunSetup> {
  const safety = await bootstrapKernel(repoRoot);
  // SETTINGS-BLOCKEDTOOLS-ENFORCE: load settings BEFORE buildRegistry so a tool
  // in settings.blockedTools is excluded from the live session registry. The
  // same settings object is reused by loadRuntimeExtensions (no second load).
  const settings = await loadRuntimeSettings(repoRoot);
  const registry = buildRegistry({ exclude: settings.blockedTools ?? [] });
  const mcpTrust = { root: repoRoot, confirm: opts.confirmTrust };
  const { pluginCommands, mcpSkills } = await loadRuntimeExtensions(repoRoot, registry, mcpTrust, settings);
  const effortLevel = resolveEffortLevel(process.env.VANTA_EFFORT_LEVEL ?? settings.effortLevel);
  const provider = resolveRoutedProvider(process.env, instruction);
  // VANTA-API-PRECONNECT: opt-in (VANTA_PRECONNECT) best-effort TCP+TLS pre-warm
  // to the provider's API host so the first request skips the handshake. Fire-
  // and-forget — never awaited, swallows its own failure, cannot affect startup.
  void preconnectStartup(process.env);
  const goals = await safety.getGoals().catch(() => []);
  const activeIds = goals.filter((g) => g.status === "active").map((g) => g.id);

  const { prefetchApiKeyHelper } = await import("./api-key-helper.js");
  await prefetchApiKeyHelper(settings, process.env);
  installMessageDisplayHooks(globalHookBus, process.env);

  // VANTA-SAFE-MODE: project context + InstructionsLoaded hooks are isolation-
  // gated inside these helpers (safe-mode/bare skip context; safe-mode skips
  // hooks). Neither flag → trust gate + hook fire run unchanged.
  const loadContext = await resolveLoadContext(repoRoot, opts.confirmTrust, settings);
  const prompt = await buildRunPrompt({ repoRoot, instruction, goals, registry, activeIds, loadContext });
  await fireInstructionsLoaded(repoRoot, instruction, provider);
  let systemPrompt = prompt.systemPrompt;
  if (skillBody) systemPrompt += `\n\nApply this skill:\n${skillBody}`;
  if (instruction === "interactive session") systemPrompt = await injectResume(systemPrompt, repoRoot);
  const advisorProvider = resolveAdvisorProvider(process.env) ?? undefined;
  // VANTA-ASCIICAST: opt-in auto-record (VANTA_RECORD=1). Off = byte-identical,
  // and a failure to open the .cast file must never block the session.
  if (process.env.VANTA_RECORD === "1") {
    const { startRecording, isRecording } = await import("./recording/session-recorder.js");
    if (!isRecording()) {
      const rec = startRecording(process.env);
      if (rec.ok) console.log(`  ⏺ recording session → ${rec.path}`);
    }
  }
  logSessionConfig(safety, provider, registry, systemPrompt);
  return { safety, registry, pluginCommands, mcpSkills, provider, advisorProvider, effortLevel, goals, systemPrompt, ralphContinuity: prompt.ralphContinuity };
}

const SUMMARIZE_SYS =
  "Summarize the following conversation messages into a compact paragraph capturing decisions, findings, and open threads. Be terse.";

function summarizeSys(instructions?: string): string {
  const focus = instructions?.trim();
  return focus ? `${SUMMARIZE_SYS}\nFocus especially on: ${focus}` : SUMMARIZE_SYS;
}

/** AUX-MODEL-MAP: route summarization to its aux model when one is configured
 * (VANTA_MODEL_SUMMARIZE / VANTA_SUMMARIZE_PROVIDER), else the active provider —
 * behavior-preserving by default. Pure decision; the resolution itself lives in
 * routing/aux-map.ts and is tested there. */
export function shouldUseAuxSummarize(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.VANTA_MODEL_SUMMARIZE || env.VANTA_SUMMARIZE_PROVIDER);
}

function summarizeProvider(fallback: LLMProvider): LLMProvider {
  return shouldUseAuxSummarize(process.env) ? resolveAuxProvider("summarize", process.env) : fallback;
}

export function buildSummarizer(provider: LLMProvider, instructions?: string): Summarizer {
  const sys = summarizeSys(instructions);
  return async (msgs) =>
    (
      await summarizeProvider(provider).complete(
        [
          { role: "system", content: sys },
          { role: "user", content: JSON.stringify(msgs).slice(0, 12000) },
        ],
        [],
      )
    ).text;
}

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
