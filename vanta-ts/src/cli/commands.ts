import { createInterface } from "node:readline/promises";
import { createConversation, type AgentDeps } from "../agent.js";
import { listSessions } from "../sessions/store.js";
import { resolveRoomOrExit, suggestSkillFromRun } from "../projects/commands.js";
import {
  prepareRun,
  buildSummarizer,
  writeRunMemory,
  approver,
  reviewAfterTurn,
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
import { fireHooks } from "../hooks/shell-hooks.js";
import { startHookFileWatcher } from "../hooks/file-watch.js";
import { errorDetails, fireCwdChanged, fireStopFailure, stopFailureType } from "../hooks/runtime-events.js";
import { join } from "node:path";

const USAGE_LINES = [
      "Usage: vanta                              start an interactive session",
      "       vanta --effort <low|medium|high|max>   set model effort for this session",
      "       vanta --init | --init-only | --maintenance   run lifecycle bootstrap hooks",
      "       vanta --plugin-url <url> | --plugin-dir <path>   install a plugin (.zip/dir) at startup (stays disabled until enabled)",
      "       vanta sessions | resume <id> [--fork-session]   list, resume, or fork a session",
      "       vanta setup                        complete guided wizard: model, messaging, MCP, personality, health",
      "       vanta setup model                  just the model/provider picker",
      "       vanta setup messaging              configure a messaging gateway (Telegram, …)",
      "       vanta setup tts                    configure the voice/TTS provider (Edge keyless, OpenAI, ElevenLabs, local)",
      "       vanta config <get|set|edit|check>  manage settings (~/.vanta/config.json; secrets → .env)",
      "       vanta status | doctor              health check (kernel, provider, keys, store)",
      "       vanta goals                        show kernel goals plus dependency graph state",
      '       vanta run "<instruction>"          run one instruction and exit',
      "       vanta skills [install [--force]|lint]   list / install bundled / validate SKILL.md files",
      '       vanta skill <name> ["<instruction>"]  print a skill, or run with it',
      '       vanta schedule "<instruction>" --cron "<expr>" | schedule list',
      "       vanta cron                         run due tasks once (for launchd/cron)",
      "       vanta gateway                      run the scheduler as a foreground daemon",
      "       vanta service [install|uninstall|status]   manage the background launchd agent",
      "       vanta agents [list|logs|attach|stop|rm|respawn]   manage background agent sessions",
      "       vanta hire <role> --adapter <id> [--budget <usd>]   add a budgeted, role-tagged agent to the roster",
      "       vanta fleet run --task <instruction> [--task <instruction> ...]   fan out worktree workers",
      "       vanta daemon [status|stop]          inspect or stop the background supervisor",
      "       vanta auto-mode [defaults|config]  inspect auto permission classifier config",
      "       vanta auto-research --objective <text> --metric <cmd> --bounds <text>   improve a numeric metric in worktrees",
      "       vanta meta-tune instructions [--iters N] [--adopt]   score bounded PROGRAM.md variants",
      "       vanta rooms | room <name> [\"<instruction>\"]   project rooms",
      "       vanta modes [list|install]         operator modes",
      "       vanta auth google                  one-time Google OAuth",
      "       vanta mcp [list|serve]             list MCP servers Vanta consumes, or serve Vanta's tools over MCP stdio",
      "       vanta roadmap                      build roadmap.html from roadmap.json and open it",
      "       vanta roadmap move <id> <status>   move an item (shipped|building|next|horizon)",
      "       vanta roadmap serve                start drag-and-drop board at http://localhost:7789/roadmap/board",
      "       vanta desktop [port]                start local desktop command center",
      "       vanta audit                        npm + cargo dependency security scan",
      "       vanta lint [files|--staged]        code-size gate: file≤300 fn≤50 params≤4 complexity≤10",
      "       vanta model [list | <provider> [<model>]]  show or switch the active provider/model",
      "       vanta pairing [list | approve <chatId>]  manage messaging platform pairings",
      "       vanta update [--rollback]              pull latest + rebuild; --rollback restores last snapshot",
      "       vanta open <file[:line]>           open a file:line in your editor",
      "       vanta prompt-size                  per-turn token breakdown (prompt + tool schemas)",
      "       vanta completion [bash|zsh|fish]   print a shell completion script",
      "       vanta backup [out.tgz] | import <in.tgz>   archive / restore ~/.vanta",
      "       vanta improve                      run one factory cycle (review mode — prints plan)",
      "       vanta factory [approve|status]     execute or check the dark factory (autonomy L1-4 via VANTA_AUTONOMY_LEVEL)",
];

export function usage(): void {
  console.log(USAGE_LINES.join("\n"));
}

export function usageExit(): never {
  usage();
  process.exit(1);
}

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
    const outcome = await convo.send(maybeAugmentPrompt(instruction));
    await fireHooks(join(root, ".vanta"), "Stop", { finalResponse: outcome.finalText, turnIndex: 1 }, { cwd: root, sessionType: "one-shot", ...buildAgentHookDeps(agentDeps) });
    emitOutput(format, outcome.finalText, setup.provider.modelId());
    if (!structured) console.log(`\n[${outcome.stoppedReason} · ${outcome.iterations} iteration(s)]`);
    await writeRunMemory({ provider: setup.provider, goals: setup.goals, instruction, finalText: outcome.finalText });
    await suggestSkillFromRun(instruction, process.env);
    await reviewAfterTurn({
      provider: setup.provider,
      safety: setup.safety,
      root,
      transcript: convo.messages,
      toolIterations: outcome.toolIterations,
      turnIndex: 1,
    });
    memoryExtractAfterTurn({ provider: setup.provider, transcript: convo.messages });
  } catch (err) {
    await fireStopFailure(root, { error: stopFailureType(err), errorDetails: errorDetails(err) }, buildAgentHookDeps(agentDeps));
    throw err;
  } finally {
    stopFileWatcher();
    await fireHooks(join(root, ".vanta"), "SessionEnd", { reason: "other", sessionType: "one-shot" }, { cwd: root, matcherValue: "other", sessionType: "one-shot", ...buildAgentHookDeps(agentDeps) });
    process.removeListener("SIGINT", onSigint);
    rl.close();
  }
}

export async function runVoiceCommand(repoRoot: string): Promise<void> {
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

export async function runRoomCommand(repoRoot: string, rest: string[]): Promise<void> {
  const [name, ...instr] = rest;
  if (!name) return usageExit();
  const room = await resolveRoomOrExit(name, process.env);
  if (!room) process.exit(1);
  if (instr.length === 0) return void console.log(room.path);
  if (room.path !== repoRoot) await fireCwdChanged(room.path, repoRoot, room.path);
  await runInstruction(repoRoot, instr.join(" "), { root: room.path });
}
