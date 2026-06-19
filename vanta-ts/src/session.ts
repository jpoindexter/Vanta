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
import type { LLMProvider } from "./providers/interface.js";
import { resolveEffortLevel } from "./effort.js";
import type { Summarizer } from "./context.js";
import type { EffortLevel, Goal } from "./types.js";
import {
  loadRuntimeExtensions, buildRunPrompt, injectResume, logSessionConfig,
} from "./session/prepare-helpers.js";
import { fireHooks } from "./hooks/shell-hooks.js";
import { resolveProjectTrust, type TrustConfirmer } from "./settings/trust-gate.js";
export { loadRalphContinuity } from "./session/prepare-helpers.js";

export * from "./session/after-turn.js";
export * from "./session/console-callbacks.js";
export * from "./session/curate.js";

export type RunSetup = {
  safety: KernelClient;
  registry: ReturnType<typeof buildRegistry>;
  pluginCommands: PluginCommandRegistry;
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

export async function prepareRun(
  repoRoot: string,
  instruction: string,
  skillBody?: string,
  opts: PrepareRunOpts = {},
): Promise<RunSetup> {
  const baseUrl = process.env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788";
  const kernelBin = join(repoRoot, "target", "debug", "vanta-kernel");
  await ensureKernel({ baseUrl, kernelBin, root: repoRoot });

  const safety = createKernelClient(baseUrl);
  const registry = buildRegistry();
  const mcpTrust = { root: repoRoot, confirm: opts.confirmTrust };
  const { settings, pluginCommands } = await loadRuntimeExtensions(repoRoot, registry, mcpTrust);
  const effortLevel = resolveEffortLevel(process.env.VANTA_EFFORT_LEVEL ?? settings.effortLevel);
  const provider = resolveRoutedProvider(process.env, instruction);
  const goals = await safety.getGoals().catch(() => []);
  const activeIds = goals.filter((g) => g.status === "active").map((g) => g.id);

  const { prefetchApiKeyHelper } = await import("./api-key-helper.js");
  await prefetchApiKeyHelper(settings, process.env);
  installMessageDisplayHooks(globalHookBus, process.env);

  const loadContext = await resolveProjectTrust(repoRoot, opts.confirmTrust);
  const prompt = await buildRunPrompt({ repoRoot, instruction, goals, registry, activeIds, loadContext });
  await fireHooks(join(repoRoot, ".vanta"), "InstructionsLoaded", { reason: "session_start", instruction }, { cwd: repoRoot, matcherValue: "session_start", promptProvider: provider });
  let systemPrompt = prompt.systemPrompt;
  if (skillBody) systemPrompt += `\n\nApply this skill:\n${skillBody}`;
  if (instruction === "interactive session") {
    systemPrompt = await injectResume(systemPrompt, repoRoot);
  }
  const advisorProvider = resolveAdvisorProvider(process.env) ?? undefined;
  logSessionConfig(safety, provider, registry, systemPrompt);
  return { safety, registry, pluginCommands, provider, advisorProvider, effortLevel, goals, systemPrompt, ralphContinuity: prompt.ralphContinuity };
}

const SUMMARIZE_SYS =
  "Summarize the following conversation messages into a compact paragraph capturing decisions, findings, and open threads. Be terse.";

function summarizeSys(instructions?: string): string {
  const focus = instructions?.trim();
  return focus ? `${SUMMARIZE_SYS}\nFocus especially on: ${focus}` : SUMMARIZE_SYS;
}

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
