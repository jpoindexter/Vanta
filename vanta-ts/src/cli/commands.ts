import { createInterface } from "node:readline/promises";
import { createConversation, type AgentDeps, type AgentOutcome, type Conversation } from "../agent.js";
import { listSessions } from "../sessions/store.js";
import { resolveRoomOrExit, suggestSkillFromRun } from "../projects/commands.js";
import {
  prepareRun,
  buildSummarizer,
  writeRunMemory,
  approver,
  reviewAfterTurn,
  isExplicitChoiceWall,
  memoryExtractAfterTurn,
  maybeCurate,
} from "../session.js";
import { loadSchema } from "../output/json-schema.js";
import { runLifecycleHooks, type LifecycleFlags } from "./lifecycle.js";
import { installPluginSources } from "./plugin-source-install.js";
import type { PluginSource } from "./plugin-source-flags.js";
import { buildCallbacks } from "./output-callbacks.js";
import { buildAgentHookDeps } from "../hooks/agent-hook-deps.js";
import { maybeAugmentPrompt } from "../templates/templates.js";
import { buildAgentRouteHint } from "../repl/agent-route.js";
import { fireHooks } from "../hooks/shell-hooks.js";
import { startHookFileWatcher } from "../hooks/file-watch.js";
import { errorDetails, fireCwdChanged, fireStopFailure, stopFailureType } from "../hooks/runtime-events.js";
import { join } from "node:path";

import { usage, usageExit } from "./usage.js";
export { usage, usageExit };

export async function runSessionsList(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const sessions = await listSessions(env);
  if (sessions.length === 0) return void console.log("(no saved sessions yet)");
  for (const s of sessions) console.log(`${s.id}  ${s.turns} turn(s)  ${s.title}`);
  console.log("\nResume with: vanta resume <id>");
}

export type OutputFormat = "text" | "json" | "stream-json";

function emitOutput(format: OutputFormat, finalText: string, modelId: string): void {
  if (format === "json") {
    console.log(JSON.stringify({ text: finalText, model: modelId }));
  } else if (format === "stream-json") {
    console.log(JSON.stringify({ type: "done", text: finalText }));
  } else {
    console.log(`\n${finalText}`);
  }
}

function oneShotDeps(o: { setup: Awaited<ReturnType<typeof prepareRun>>; root: string; rl: ReturnType<typeof createInterface>; signal: AbortSignal; format: OutputFormat; outputSchema?: Record<string, unknown> }): AgentDeps {
  return {
    provider: o.setup.provider,
    safety: o.setup.safety,
    registry: o.setup.registry,
    root: o.root,
    usageAgent: "one-shot",
    requestApproval: approver(o.rl),
    maxIterations: Number(process.env.VANTA_MAX_ITER) || undefined,
    summarize: buildSummarizer(o.setup.provider),
    getEffortLevel: () => o.setup.effortLevel,
    activeGoalText: o.setup.goals.find((g) => g.status === "active")?.text,
    signal: o.signal,
    outputSchema: o.outputSchema,
    ...buildCallbacks(o.format),
  };
}

/**
 * The one-shot user message: template augmentation + the cross-agent route hint
 * (VANTA-AGENT-ROUTING-DISCOVERY), so `vanta run "talk to claude"` reaches for
 * call_agent like the interactive buildSendText does. `VANTA_AGENT_ROUTE=0` off.
 */
export function buildOneShotSendText(instruction: string): string {
  const augmented = maybeAugmentPrompt(instruction);
  const routeHint = process.env.VANTA_AGENT_ROUTE !== "0" ? buildAgentRouteHint(instruction) : null;
  return routeHint ? `${routeHint}\n\n${augmented}` : augmented;
}

async function finishOneShot(o: {
  outcome: AgentOutcome; format: OutputFormat; structured: boolean;
  setup: Awaited<ReturnType<typeof prepareRun>>; root: string; instruction: string; convo: Conversation;
}): Promise<void> {
  const choiceWall = isExplicitChoiceWall(o.outcome.finalText);
  emitOutput(o.format, o.outcome.finalText, o.setup.provider.modelId());
  if (!o.structured) console.log(`\n[${o.outcome.stoppedReason} · ${o.outcome.iterations} iteration(s)]`);
  await writeRunMemory({ provider: o.setup.provider, goals: o.setup.goals, instruction: o.instruction, finalText: o.outcome.finalText });
  if (!choiceWall) await suggestSkillFromRun(o.instruction, process.env);
  await reviewAfterTurn({
    provider: o.setup.provider, safety: o.setup.safety, root: o.root, transcript: o.convo.messages,
    toolIterations: o.outcome.toolIterations, turnIndex: 1, deferMutation: choiceWall,
  });
  memoryExtractAfterTurn({ provider: o.setup.provider, transcript: o.convo.messages });
}

export async function runInstruction(
  repoRoot: string,
  instruction: string,
  opts: { skillBody?: string; root?: string; outputFormat?: OutputFormat; jsonSchema?: string; lifecycle?: LifecycleFlags; pluginSources?: PluginSource[] } = {},
): Promise<void> {
  const format: OutputFormat = opts.outputFormat ?? "text";
  const structured = format !== "text";
  const root = opts.root ?? repoRoot;
  if (opts.pluginSources?.length) await installPluginSources(root, opts.pluginSources);
  if (opts.lifecycle && await runLifecycleHooks(root, opts.lifecycle, "one-shot")) return;
  const schema = loadSchema(opts.jsonSchema ?? process.env.VANTA_JSON_SCHEMA);
  const setup = await prepareRun(root, instruction, opts.skillBody);
  await maybeCurate();
  const activeGoals = setup.goals.filter((g) => g.status === "active").length;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  if (!structured) console.log(`vanta · ${setup.provider.modelId()} · ${activeGoals} active goal(s)\n`);
  const controller = new AbortController();
  const onSigint = (): void => controller.abort();
  process.once("SIGINT", onSigint);
  const agentDeps = oneShotDeps({ setup, root, rl, signal: controller.signal, format, outputSchema: schema });
  const stopFileWatcher = await startHookFileWatcher(root, { dataDir: join(root, ".vanta"), ...buildAgentHookDeps(agentDeps) });
  try {
    await fireHooks(join(root, ".vanta"), "SessionStart", { source: "startup", sessionType: "one-shot" }, { cwd: root, matcherValue: "startup", sessionType: "one-shot", ...buildAgentHookDeps(agentDeps) });
    const convo = createConversation(setup.systemPrompt, agentDeps);
    await fireHooks(join(root, ".vanta"), "UserPromptSubmit", { prompt: instruction }, { cwd: root, prompt: instruction, sessionType: "one-shot", ...buildAgentHookDeps(agentDeps) });
    const outcome = await convo.send(buildOneShotSendText(instruction));
    await fireHooks(join(root, ".vanta"), "Stop", { finalResponse: outcome.finalText, turnIndex: 1 }, { cwd: root, sessionType: "one-shot", ...buildAgentHookDeps(agentDeps) });
    await finishOneShot({ outcome, format, structured, setup, root, instruction, convo });
  } catch (err) {
    await fireStopFailure(root, { error: stopFailureType(err), errorDetails: errorDetails(err) }, buildAgentHookDeps(agentDeps));
    throw err;
  } finally {
    await stopFileWatcher();
    await fireHooks(join(root, ".vanta"), "SessionEnd", { reason: "other", sessionType: "one-shot" }, { cwd: root, matcherValue: "other", sessionType: "one-shot", ...buildAgentHookDeps(agentDeps) });
    process.removeListener("SIGINT", onSigint);
    rl.close();
  }
}

export async function runVoiceCommand(repoRoot: string, rest: string[] = []): Promise<void> {
  if (rest[0] === "wake") {
    const { runWakeCommand } = await import("./wake-cmd.js");
    await runWakeCommand(repoRoot, rest.slice(1));
    return;
  }
  if (rest[0] === "mic") {
    const { openPrivacyPane } = await import("../platform/macos-prefs.js");
    console.log(openPrivacyPane("microphone").message);
    return;
  }
  const setup = await prepareRun(repoRoot, "voice session");
  const { runVoiceLoop } = await import("../voice/loop.js");
  await runVoiceLoop({
    provider: setup.provider,
    safety: setup.safety,
    registry: setup.registry,
    root: repoRoot,
    systemPrompt: setup.systemPrompt,
    durationSec: parseInt(process.env.VANTA_VOICE_DURATION ?? "5", 10) || 5,
  });
}

export async function runRoomCommand(repoRoot: string, rest: string[]): Promise<number | void> {
  const [name, ...instr] = rest;
  if (!name) return usageExit();
  const room = await resolveRoomOrExit(name, process.env);
  if (!room) process.exit(1);
  if (instr.length === 0) return void console.log(room.path);
  if (room.path !== repoRoot) await fireCwdChanged(room.path, repoRoot, room.path);
  await runInstruction(repoRoot, instr.join(" "), { root: room.path });
  return 0; // one-shot DONE — numeric return → cli.ts process.exit, so MCP handles don't hang
}
