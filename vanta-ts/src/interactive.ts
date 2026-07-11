import { createInterface } from "node:readline/promises";
import { join, basename } from "node:path";
import { advertisePeer } from "./uds/peers.js";
import { createConversation, type AgentDeps } from "./agent.js";
import { listSkills } from "./skills/store.js";
import { type ReplState } from "./repl-commands.js";
import { RESTART_EXIT_CODE } from "./repl/restart-cmd.js";
import { prepareRun, buildSummarizer, consoleCallbacks, approver, maybeCurate } from "./session.js";
import { freshGateState } from "./repl/post-turn-gates.js";
import { softStopPredicate, consumeSoftStop, SOFT_STOP } from "./repl/stop-cmd.js";
import { SessionWorkingMemory } from "./memory/working.js";
import { archiveSession } from "./memory/archive.js";
import { fireHooks, loadShellHooks, matchingHooks, runOneHook } from "./hooks/shell-hooks.js";
import { partitionDeferred, runDeferred } from "./hooks/deferred-hooks.js";
import { startHookFileWatcher } from "./hooks/file-watch.js";
import { errorDetails, fireStopFailure, stopFailureType } from "./hooks/runtime-events.js";
import { loadUserCommands } from "./commands/loader.js";
import { CheckpointStore } from "./sessions/checkpoint.js";
import { buildCheckpointHandlers } from "./repl/checkpoint-cmd.js";
import { PLAN_MARKER } from "./repl/plan-mode.js";
import { forkSession, loadSession, newSessionId } from "./sessions/store.js";
import { registerSession, deregisterSession, defaultRegistryDeps } from "./sessions/active-registry.js";
import { buildShutdownMessage } from "./repl/shutdown-msg.js";
import { executeUserTurn, type TurnDeps } from "./interactive-turn.js";
import { runLifecycleHooks, type LifecycleFlags } from "./cli/lifecycle.js";
import { runReplLoop } from "./interactive-repl.js";
import { buildAgentHookDeps } from "./hooks/agent-hook-deps.js";
import type { TrustConfirmer } from "./settings/trust-gate.js";

import { renderBanner } from "./interactive-banner.js";
import { resumeRecap } from "./repl/suggestions.js";
import { maybeShowCmdBackspaceHint } from "./term/cmd-backspace-hint.js";
export { renderBanner };

/** Trust confirmer for the readline REPL host; undefined off a TTY → headless fail-safe. */
async function replTrustConfirmer(rl: ReturnType<typeof createInterface>): Promise<TrustConfirmer | undefined> {
  if (!process.stdin.isTTY) return undefined;
  const { readlineTrustConfirmer } = await import("./settings/trust-readline.js");
  return readlineTrustConfirmer(rl);
}

/** Advertise this session as a UDS peer (best-effort) and return its teardown.
 * Inbound peer messages surface as a notification line. */
async function advertiseSession(sessionId: string, repoRoot: string): Promise<() => Promise<void>> {
  process.env.VANTA_PEER_ID = sessionId;
  const handle = await advertisePeer({
    id: sessionId,
    title: basename(repoRoot),
    onMessage: (m) => console.log(`\n  📨 peer ${m.from}: ${m.text}\n`),
  }).catch(() => null);
  return async () => {
    await handle?.stop().catch(() => {});
  };
}

/** Register this instance (VANTA-CONCURRENT-SESSIONS) + print the banner and resume notices. */
async function announceSessionStart(o: {
  setup: Awaited<ReturnType<typeof prepareRun>>;
  repoRoot: string;
  skills: { meta: { name: string } }[];
  state: ReplState;
  resumed: Awaited<ReturnType<typeof loadResumeTarget>>;
  resumeId?: string;
}): Promise<void> {
  await registerSession({ pid: process.pid, sessionId: o.state.sessionId, project: o.repoRoot }, defaultRegistryDeps());
  console.log(renderBanner({ modelId: o.setup.provider.modelId(), root: o.repoRoot, goals: o.setup.goals, toolNames: o.setup.registry.schemas().map((s) => s.name), skillNames: o.skills.map((s) => s.meta.name) }));
  printRalphContinuityNotice(o.setup.ralphContinuity);
  if (o.resumed) {
    console.log(`  ↻ Resumed session ${o.resumed.id} "${o.resumed.title}" (${o.resumed.messages.filter((m) => m.role === "user").length} turn(s))\n`);
    const recap = await resumeRecap({ getGoals: () => o.setup.safety.getGoals(), dataDir: join(o.repoRoot, ".vanta") }).catch(() => "");
    if (recap) console.log(`${recap}\n`);
  } else if (o.resumeId) console.log(`  (no session "${o.resumeId}" found — starting fresh)\n`);
  // TUI-CMD-BACKSPACE-TERMINALAPP: one-time Terminal.app hint (no-op elsewhere).
  await maybeShowCmdBackspaceHint(process.env, (m) => console.log(`${m}\n`)).catch(() => false);
}

/** Load skills and, best-effort, sync skill-declared cron schedules on load
 *  (HARNESS-BLUEPRINT-SKILLS — register/unregister via the existing scheduler). */
async function loadSkillsWithCronSync(repoRoot: string): Promise<Awaited<ReturnType<typeof listSkills>>> {
  const skills = await listSkills();
  void import("./skills/scheduled.js").then((m) => m.syncSkillCrons(join(repoRoot, ".vanta"))).catch(() => {});
  return skills;
}

export async function runChat(repoRoot: string, opts: { resumeId?: string; forkSession?: boolean; lifecycle?: LifecycleFlags } = {}): Promise<void> {
  if (opts.lifecycle && await runLifecycleHooks(repoRoot, opts.lifecycle, "interactive")) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const setup = await prepareRun(repoRoot, "interactive session", undefined, { confirmTrust: await replTrustConfirmer(rl) });
  await maybeCurate();
  const skills = await loadSkillsWithCronSync(repoRoot);
  const resumed = opts.resumeId ? await loadResumeTarget(opts.resumeId, opts.forkSession) : null;
  const state: ReplState = {
    sessionId: resumed?.id ?? newSessionId(),
    started: resumed?.started ?? new Date().toISOString(),
    turnIndex: resumed?.messages.filter((m) => m.role === "user").length ?? 0,
    effortLevel: setup.effortLevel,
  };
  await announceSessionStart({ setup, repoRoot, skills, state, resumed, resumeId: opts.resumeId });

  const workingMemory = new SessionWorkingMemory();
  const { convo, agentDeps } = buildConversation({ repoRoot, setup, state, rl, workingMemory, history: resumed?.messages });
  await fireSessionStart(repoRoot, state.sessionId, Boolean(resumed), agentDeps);
  const stopFileWatcher = await startHookFileWatcher(repoRoot, { dataDir: join(repoRoot, ".vanta"), ...buildAgentHookDeps(agentDeps, (m) => console.log(m)) });

  // VANTA-UDS-PEERS: advertise this session so other live sessions can discover
  // it (`/peers`, list_peers) and message it (peer_send). Returns its teardown.
  const stopPeer = await advertiseSession(state.sessionId, repoRoot);

  const checkpoints = new CheckpointStore();
  const { checkpoint: cp, rollback: rb, restore: rs } = buildCheckpointHandlers(checkpoints);
  const userCommands = await loadUserCommands(process.env);
  const ctx = { convo, setup, dataDir: join(repoRoot, ".vanta"), state, env: process.env, now: () => new Date(), workingMemory };
  const capHaltedRef = { current: false };
  const turnDeps: TurnDeps = { convo, setup, state, repoRoot, workingMemory, agentDeps, autoHandoffNotedRef: { current: false }, contextUpgradeNotedRef: { current: false }, gatesRef: { current: freshGateState() }, capHaltedRef };
  // VANTA-STOP-CMD: clear any stale soft-stop signal at the start of each turn so
  // `/stop` only affects the turn it was issued during.
  const runUserTurn = (text: string) => { consumeSoftStop(SOFT_STOP); return executeUserTurn(text, turnDeps); };

  try {
    await runLoopWithFailureHook({ rl, convo, ctx, cp, rb, rs, userCommands, setup, repoRoot, runUserTurn, state, agentDeps, capHaltedRef });
  } finally {
    // VANTA-CONCURRENT-SESSIONS: deregister on clean exit (a crash leaves a stale
    // row that the next `listActiveSessions` prunes via the dead-pid check).
    await deregisterSession(process.pid, defaultRegistryDeps());
    await stopFileWatcher();
    await stopPeer();
    archiveSession(state.sessionId, convo.messages, { now: new Date().toISOString() }).catch(() => {});
    await fireHooks(join(repoRoot, ".vanta"), "Stop", { sessionId: state.sessionId }, { cwd: repoRoot, ...buildAgentHookDeps(agentDeps, (m) => console.log(m)) });
    await fireSessionEnd(repoRoot, state.sessionId, agentDeps);
    rl.close();
  }
  if (process.exitCode === RESTART_EXIT_CODE) process.exit(RESTART_EXIT_CODE);
  console.log("\n" + buildShutdownMessage({ startedIso: state.started, nowIso: new Date().toISOString(), turnCount: state.turnIndex, sessionCost: state.sessionCost }));
}

async function runLoopWithFailureHook(o: Parameters<typeof runReplLoop>[0] & { state: ReplState; agentDeps: AgentDeps }): Promise<void> {
  try {
    await runReplLoop(o);
  } catch (err) {
    await fireStopFailure(o.repoRoot, { sessionId: o.state.sessionId, error: stopFailureType(err), errorDetails: errorDetails(err) }, buildAgentHookDeps(o.agentDeps, (m) => console.log(m)));
    throw err;
  }
}

// VANTA-DEFERRED-SESSION-HOOKS: SessionStart hooks marked `defer: true` run
// fire-and-forget so they don't block the REPL becoming interactive; non-deferred
// SessionStart hooks still run inline (awaited) exactly as before. With no hook
// setting `defer`, the deferred set is empty and this awaits the inline set —
// byte-identical to the prior single `fireHooks` call.
async function fireSessionStart(repoRoot: string, sessionId: string, resumed: boolean, deps: AgentDeps): Promise<void> {
  const source = resumed ? "resume" : "startup";
  const dataDir = join(repoRoot, ".vanta");
  const opts = { cwd: repoRoot, matcherValue: source, ...buildAgentHookDeps(deps, (m) => console.log(m)) };
  const matched = matchingHooks(await loadShellHooks(dataDir), "SessionStart", { matcherValue: source });
  if (!matched.length) return;
  const { inline, deferred } = partitionDeferred(matched);
  const contextJson = JSON.stringify({ event: "SessionStart", sessionId, source });
  runDeferred(deferred, (hook) => runOneHook(hook, "SessionStart", contextJson, opts));
  await Promise.all(inline.map((hook) => runOneHook(hook, "SessionStart", contextJson, opts)));
}

function fireSessionEnd(repoRoot: string, sessionId: string, deps: AgentDeps): Promise<void> {
  return fireHooks(join(repoRoot, ".vanta"), "SessionEnd", { sessionId, reason: "prompt_input_exit" }, { cwd: repoRoot, matcherValue: "prompt_input_exit", ...buildAgentHookDeps(deps, (m) => console.log(m)) });
}

function printRalphContinuityNotice(block?: string): void {
  if (block) console.log(`  ↻ ${block.split("\n")[0]} Use /goal resume to continue or /goal drop to discard.\n`);
}

async function loadResumeTarget(id: string, fork: boolean | undefined): Promise<Awaited<ReturnType<typeof loadSession>>> {
  return fork ? forkSession(id) : loadSession(id);
}

type ConvoOpts = {
  repoRoot: string;
  setup: Awaited<ReturnType<typeof prepareRun>>;
  state: ReplState;
  rl: ReturnType<typeof createInterface>;
  workingMemory: SessionWorkingMemory;
  history?: NonNullable<Parameters<typeof createConversation>[2]>["history"];
};

function buildConversation(o: ConvoOpts): { convo: ReturnType<typeof createConversation>; agentDeps: AgentDeps } {
  const { repoRoot, setup, state, rl, workingMemory } = o;
  let convo!: ReturnType<typeof createConversation>;
  const agentDeps: AgentDeps = {
    provider: setup.provider, advisorProvider: setup.advisorProvider, safety: setup.safety, registry: setup.registry, root: repoRoot,
    sessionId: state.sessionId,
    requestApproval: approver(rl), maxIterations: Number(process.env.VANTA_MAX_ITER) || undefined,
    summarize: buildSummarizer(setup.provider), activeGoalText: setup.goals.find((g) => g.status === "active")?.text,
    getEffortLevel: () => state.effortLevel ?? setup.effortLevel,
    workingMemory,
    onAutoCompact: (dropped, summary) => console.log(`  ⟳ auto-compacted ${dropped} messages — ${summary.length > 80 ? summary.slice(0, 77) + "…" : summary}`),
    ...consoleCallbacks(),
    onThinking: (t) => console.log(`  ⚙ ${t.split("\n")[0]?.slice(0, 80) ?? ""}`),
    planGate: () => { const sys = convo.messages[0]; return !!(sys?.content.includes(PLAN_MARKER) && !state.planApproved); },
    shouldSoftStop: softStopPredicate(SOFT_STOP),
  };
  convo = createConversation(setup.systemPrompt, agentDeps, { history: o.history });
  return { convo, agentDeps };
}
