import { createInterface } from "node:readline/promises";
import { join } from "node:path";
import { createConversation } from "./agent.js";
import { listSkills } from "./skills/store.js";
import { type ReplState } from "./repl-commands.js";
import { RESTART_EXIT_CODE } from "./repl/restart-cmd.js";
import { groupToolsByDomain } from "./term/capabilities.js";
import { prepareRun, buildSummarizer, consoleCallbacks, approver, maybeCurate } from "./session.js";
import { freshGateState } from "./repl/post-turn-gates.js";
import { SessionWorkingMemory } from "./memory/working.js";
import { archiveSession } from "./memory/archive.js";
import { fireHooks } from "./hooks/shell-hooks.js";
import { loadUserCommands } from "./commands/loader.js";
import { CheckpointStore } from "./sessions/checkpoint.js";
import { buildCheckpointHandlers } from "./repl/checkpoint-cmd.js";
import { PLAN_MARKER } from "./repl/plan-mode.js";
import { newSessionId, resolveSessionStore, type Session } from "./sessions/index.js";
import type { Goal } from "./types.js";
import { executeUserTurn, type TurnDeps } from "./interactive-turn.js";
import { runLifecycleHooks, type LifecycleFlags } from "./cli/lifecycle.js";
import { runReplLoop } from "./interactive-repl.js";

const LOGO = String.raw`
   █████╗ ██████╗  ██████╗  ██████╗
  ██╔══██╗██╔══██╗██╔════╝ ██╔═══██╗
  ███████║██████╔╝██║  ███╗██║   ██║
  ██╔══██║██╔══██╗██║   ██║██║   ██║
  ██║  ██║██║  ██║╚██████╔╝╚██████╔╝
  ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝`;

type BannerData = { modelId: string; root: string; goals: Goal[]; toolNames: string[]; skillNames: string[] };

export function renderBanner(d: BannerData): string {
  const active = d.goals.filter((g) => g.status === "active");
  const goalLines = active.length
    ? active.map((g) => `    [${g.id}] ${g.text}`).join("\n")
    : "    (none — add one with: cargo run -- goals add \"...\")";
  const skills = d.skillNames.length ? d.skillNames.join(", ") : "(none yet — run `modes install`, or the agent writes its own)";
  return [
    LOGO, "",
    "  Vanta — trusted operator. Knows the goal, gates every action, reports only verified output.",
    `  model   ${d.modelId}`, `  root    ${d.root}`, "",
    "  Active goals:", goalLines, "",
    `  Capabilities (${d.toolNames.length} tools):`,
    ...groupToolsByDomain(d.toolNames).map((g) => `    ${g.label.padEnd(34)} ${g.tools.join(", ")}`),
    "", `  Skills: ${skills}`, "",
    "  Type a message and press enter. /help for commands, /exit to quit.", "",
  ].join("\n");
}

export async function runChat(repoRoot: string, opts: { resumeId?: string; forkSession?: boolean; lifecycle?: LifecycleFlags } = {}): Promise<void> {
  if (opts.lifecycle && await runLifecycleHooks(repoRoot, opts.lifecycle, "interactive")) return;
  const setup = await prepareRun(repoRoot, "interactive session");
  await maybeCurate();
  const skills = await listSkills();
  const resumed = opts.resumeId ? await loadResumeTarget(opts.resumeId, opts.forkSession) : null;
  const state: ReplState = {
    sessionId: resumed?.id ?? newSessionId(),
    started: resumed?.started ?? new Date().toISOString(),
    turnIndex: resumed?.messages.filter((m) => m.role === "user").length ?? 0,
    effortLevel: setup.effortLevel,
  };
  console.log(renderBanner({ modelId: setup.provider.modelId(), root: repoRoot, goals: setup.goals, toolNames: setup.registry.schemas().map((s) => s.name), skillNames: skills.map((s) => s.meta.name) }));
  printRalphContinuityNotice(setup.ralphContinuity);
  if (resumed) console.log(`  ↻ Resumed session ${resumed.id} "${resumed.title}" (${resumed.messages.filter((m) => m.role === "user").length} turn(s))\n`);
  else if (opts.resumeId) console.log(`  (no session "${opts.resumeId}" found — starting fresh)\n`);

  const workingMemory = new SessionWorkingMemory();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const convo = buildConversation({ repoRoot, setup, state, rl, workingMemory, history: resumed?.messages });

  const checkpoints = new CheckpointStore();
  const { checkpoint: cp, rollback: rb } = buildCheckpointHandlers(checkpoints);
  const userCommands = await loadUserCommands(process.env);
  const ctx = { convo, setup, dataDir: join(repoRoot, ".vanta"), state, env: process.env, now: () => new Date(), workingMemory };
  const turnDeps: TurnDeps = { convo, setup, state, repoRoot, workingMemory, autoHandoffNotedRef: { current: false }, gatesRef: { current: freshGateState() } };
  const runUserTurn = (text: string) => executeUserTurn(text, turnDeps);

  try {
    await runReplLoop({ rl, convo, ctx, cp, rb, userCommands, setup, repoRoot, runUserTurn });
  } finally {
    rl.close();
    archiveSession(state.sessionId, convo.messages, { now: new Date().toISOString() }).catch(() => {});
    await fireHooks(join(repoRoot, ".vanta"), "Stop", { sessionId: state.sessionId }, { cwd: repoRoot });
  }
  if (process.exitCode === RESTART_EXIT_CODE) process.exit(RESTART_EXIT_CODE);
  console.log("\nbye.");
}

function printRalphContinuityNotice(block?: string): void {
  if (block) console.log(`  ↻ ${block.split("\n")[0]} Use /goal resume to continue or /goal drop to discard.\n`);
}

async function loadResumeTarget(id: string, fork: boolean | undefined): Promise<Session | null> {
  const store = resolveSessionStore();
  return fork ? store.forkSession(id) : store.loadSession(id);
}

type ConvoOpts = {
  repoRoot: string;
  setup: Awaited<ReturnType<typeof prepareRun>>;
  state: ReplState;
  rl: ReturnType<typeof createInterface>;
  workingMemory: SessionWorkingMemory;
  history?: NonNullable<Parameters<typeof createConversation>[2]>["history"];
};

function buildConversation(o: ConvoOpts): ReturnType<typeof createConversation> {
  const { repoRoot, setup, state, rl, workingMemory } = o;
  let convo!: ReturnType<typeof createConversation>;
  convo = createConversation(setup.systemPrompt, {
    provider: setup.provider, advisorProvider: setup.advisorProvider, safety: setup.safety, registry: setup.registry, root: repoRoot,
    requestApproval: approver(rl), maxIterations: Number(process.env.VANTA_MAX_ITER) || undefined,
    summarize: buildSummarizer(setup.provider), activeGoalText: setup.goals.find((g) => g.status === "active")?.text,
    getEffortLevel: () => state.effortLevel ?? setup.effortLevel,
    workingMemory,
    onAutoCompact: (dropped, summary) => console.log(`  ⟳ auto-compacted ${dropped} messages — ${summary.length > 80 ? summary.slice(0, 77) + "…" : summary}`),
    ...consoleCallbacks(),
    onThinking: (t) => console.log(`  ⚙ ${t.split("\n")[0]?.slice(0, 80) ?? ""}`),
    planGate: () => { const sys = convo.messages[0]; return !!(sys?.content.includes(PLAN_MARKER) && !state.planApproved); },
  }, { history: o.history });
  return convo;
}
