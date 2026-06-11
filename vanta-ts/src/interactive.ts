import { createInterface } from "node:readline/promises";
import { join } from "node:path";
import { createConversation } from "./agent.js";
import { listSkills } from "./skills/store.js";
import { executeSlash, type ReplState } from "./repl-commands.js";
import { RESTART_EXIT_CODE } from "./repl/restart-cmd.js";
import { groupToolsByDomain } from "./tui/capabilities.js";
import { prepareRun, buildSummarizer, consoleCallbacks, approver, maybeCurate } from "./session.js";
import { freshGateState } from "./repl/post-turn-gates.js";
import { SessionWorkingMemory } from "./memory/working.js";
import { archiveSession } from "./memory/archive.js";
import { fireHooks } from "./hooks/shell-hooks.js";
import { loadUserCommands, type UserCommand } from "./commands/loader.js";
import { CheckpointStore } from "./sessions/checkpoint.js";
import { buildCheckpointHandlers } from "./repl/checkpoint-cmd.js";
import { PLAN_MARKER } from "./repl/plan-mode.js";
import { parseShortcut, runBashShortcut, runMemoryShortcut } from "./repl/shortcuts.js";
import { loadSession, newSessionId } from "./sessions/store.js";
import type { Goal } from "./types.js";
import { executeUserTurn, type TurnDeps } from "./interactive-turn.js";

const LOGO = String.raw`
   █████╗ ██████╗  ██████╗  ██████╗
  ██╔══██╗██╔══██╗██╔════╝ ██╔═══██╗
  ███████║██████╔╝██║  ███╗██║   ██║
  ██╔══██║██╔══██╗██║   ██║██║   ██║
  ██║  ██║██║  ██║╚██████╔╝╚██████╔╝
  ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝`;

type BannerData = { modelId: string; root: string; goals: Goal[]; toolNames: string[]; skillNames: string[] };

/** The startup banner: logo, model, goals, tool + skill inventory. */
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

// --- Slash-command helpers ---

type SlashCtx = Parameters<typeof executeSlash>[1];
type CpFn = (a: string, c: SlashCtx) => unknown;
type SlashResult = { exit?: boolean; restart?: boolean; editPrefill?: string; editMsgIdx?: number };

function printCpOutput(r: unknown): void {
  if (r && typeof r === "object" && "output" in r) console.log((r as { output: unknown }).output);
}

/** Run checkpoint or rollback; returns result if matched, null otherwise. */
async function tryCheckpointCmd(o: { line: string; firstToken: string; ctx: SlashCtx; cp: CpFn; rb: CpFn }): Promise<SlashResult | null> {
  if (o.firstToken === "checkpoint") { printCpOutput(o.cp(o.line.slice(o.firstToken.length + 1).trim(), o.ctx)); return {}; }
  if (o.firstToken === "rollback") { printCpOutput(o.rb("", o.ctx)); return {}; }
  return null;
}

type SlashOpts = { line: string; firstToken: string; ctx: SlashCtx; cp: CpFn; rb: CpFn; userCommands: UserCommand[]; runUserTurn: (t: string) => Promise<void> };

async function handleSlashLine(o: SlashOpts): Promise<SlashResult> {
  const cpResult = await tryCheckpointCmd({ line: o.line, firstToken: o.firstToken, ctx: o.ctx, cp: o.cp, rb: o.rb });
  if (cpResult) return cpResult;
  // TUI-CMD: user-defined commands take precedence over built-in slash dispatcher.
  const userCmd = o.userCommands.find((c) => c.name === o.firstToken);
  if (userCmd) {
    const arg = o.line.slice(o.firstToken.length + 2).trim();
    await o.runUserTurn(arg ? `${userCmd.content}\n\nArgs: ${arg}` : userCmd.content);
    return {};
  }
  return dispatchSlash(o.line, o.ctx, o.runUserTurn);
}

async function dispatchSlash(line: string, ctx: SlashCtx, runUserTurn: (t: string) => Promise<void>): Promise<SlashResult> {
  const result = await executeSlash(line, ctx);
  if (result.output) console.log(result.output);
  if (result.exit) return { exit: true };
  if (result.restart) return { restart: true };
  if (result.resend) await runUserTurn(result.resend);
  if (result.loadIntoComposer !== undefined) return { editPrefill: result.loadIntoComposer, editMsgIdx: result.editMessageIndex ?? -1 };
  return {};
}

// --- REPL loop ---

type ReplDeps = {
  rl: ReturnType<typeof createInterface>;
  convo: ReturnType<typeof createConversation>;
  ctx: SlashCtx;
  cp: CpFn;
  rb: CpFn;
  userCommands: UserCommand[];
  setup: Awaited<ReturnType<typeof prepareRun>>;
  repoRoot: string;
  runUserTurn: (text: string) => Promise<void>;
};

/** Handle a shortcut line (!! bash / !text memory). */
async function runShortcut(line: string, deps: Pick<ReplDeps, "setup" | "repoRoot">): Promise<void> {
  const shortcut = parseShortcut(line);
  if (!shortcut) return;
  if (shortcut.type === "bash") console.log(await runBashShortcut(shortcut.cmd, deps.setup.safety, deps.repoRoot).catch((e: unknown) => `error: ${e instanceof Error ? e.message : String(e)}`));
  else console.log(await runMemoryShortcut(shortcut.text, process.env).catch((e: unknown) => `error: ${e instanceof Error ? e.message : String(e)}`));
}

/** Apply a pending edit-mode replacement; returns true if consumed. */
function applyEditMode(line: string, editState: { prefill: string | null; msgIdx: number | null }, convo: ReturnType<typeof createConversation>): boolean {
  if (editState.msgIdx === null) return false;
  const idx = editState.msgIdx; editState.msgIdx = null;
  const msg = convo.messages[idx];
  if (msg && msg.role === "assistant") { convo.messages[idx] = { ...msg, content: line }; console.log("  ✎ response updated"); }
  return true;
}

/** Process one REPL iteration; returns { stop } to break the loop. */
async function replIteration(
  line: string,
  editState: { prefill: string | null; msgIdx: number | null },
  d: ReplDeps,
): Promise<{ stop?: boolean }> {
  if (applyEditMode(line, editState, d.convo)) return {};
  // Slash commands: /word (Finder-dropped paths have a nested slash → go to runUserTurn).
  const firstToken = line.slice(1).split(/\s/)[0] ?? "";
  if (line.startsWith("/") && !firstToken.includes("/")) {
    const r = await handleSlashLine({ line, firstToken, ctx: d.ctx, cp: d.cp, rb: d.rb, userCommands: d.userCommands, runUserTurn: d.runUserTurn });
    if (r.exit) return { stop: true };
    if (r.restart) { process.exitCode = RESTART_EXIT_CODE; return { stop: true }; }
    if (r.editPrefill !== undefined) { editState.prefill = r.editPrefill; editState.msgIdx = r.editMsgIdx ?? -1; }
    return {};
  }
  if (parseShortcut(line)) { await runShortcut(line, d); return {}; }
  await d.runUserTurn(line);
  return {};
}

async function runReplLoop(d: ReplDeps): Promise<void> {
  const editState = { prefill: null as string | null, msgIdx: null as number | null };
  for (;;) {
    let line: string;
    try {
      const q = d.rl.question("\nvanta › ");
      if (editState.prefill !== null) { d.rl.write(editState.prefill); editState.prefill = null; }
      line = (await q).trim();
    } catch { break; } // stdin closed (Ctrl+D / EOF) → exit cleanly
    if (!line) continue;
    const res = await replIteration(line, editState, d);
    if (res.stop) break;
  }
}

// --- Main entry point ---

/**
 * Launch the interactive session: print the banner, then a REPL that holds a
 * single conversation (history persists across turns) until /exit.
 */
export async function runChat(repoRoot: string, opts: { resumeId?: string } = {}): Promise<void> {
  const setup = await prepareRun(repoRoot, "interactive session");
  await maybeCurate();
  const skills = await listSkills();
  const resumed = opts.resumeId ? await loadSession(opts.resumeId) : null;
  const state: ReplState = {
    sessionId: resumed?.id ?? newSessionId(),
    started: resumed?.started ?? new Date().toISOString(),
    turnIndex: resumed?.messages.filter((m) => m.role === "user").length ?? 0,
  };
  console.log(renderBanner({ modelId: setup.provider.modelId(), root: repoRoot, goals: setup.goals, toolNames: setup.registry.schemas().map((s) => s.name), skillNames: skills.map((s) => s.meta.name) }));
  if (resumed) console.log(`  ↻ Resumed session ${resumed.id} "${resumed.title}" (${resumed.messages.filter((m) => m.role === "user").length} turn(s))\n`);
  else if (opts.resumeId) console.log(`  (no session "${opts.resumeId}" found — starting fresh)\n`);

  const workingMemory = new SessionWorkingMemory();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const convo = buildConversation({ repoRoot, setup, state, rl, history: resumed?.messages });

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
    // Stop shell hooks — fire on session end (best-effort).
    await fireHooks(join(repoRoot, ".vanta"), "Stop", { sessionId: state.sessionId }, { cwd: repoRoot });
  }
  if (process.exitCode === RESTART_EXIT_CODE) process.exit(RESTART_EXIT_CODE);
  console.log("\nbye.");
}

type ConvoOpts = {
  repoRoot: string;
  setup: Awaited<ReturnType<typeof prepareRun>>;
  state: ReplState;
  rl: ReturnType<typeof createInterface>;
  history?: NonNullable<Parameters<typeof createConversation>[2]>["history"];
};

function buildConversation(o: ConvoOpts): ReturnType<typeof createConversation> {
  const { repoRoot, setup, state, rl } = o;
  // Declare before assign so planGate closure can capture the ref.
  let convo!: ReturnType<typeof createConversation>;
  convo = createConversation(setup.systemPrompt, {
    provider: setup.provider, safety: setup.safety, registry: setup.registry, root: repoRoot,
    requestApproval: approver(rl), maxIterations: Number(process.env.VANTA_MAX_ITER) || undefined,
    summarize: buildSummarizer(setup.provider), activeGoalText: setup.goals.find((g) => g.status === "active")?.text,
    onAutoCompact: (dropped, summary) => console.log(`  ⟳ auto-compacted ${dropped} messages — ${summary.length > 80 ? summary.slice(0, 77) + "…" : summary}`),
    ...consoleCallbacks(),
    onThinking: (t) => console.log(`  ⚙ ${t.split("\n")[0]?.slice(0, 80) ?? ""}`),
    planGate: () => { const sys = convo.messages[0]; return !!(sys?.content.includes(PLAN_MARKER) && !state.planApproved); },
  }, { history: o.history });
  return convo;
}
