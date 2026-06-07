import { createInterface } from "node:readline/promises";
import { join } from "node:path";
import { createConversation } from "./agent.js";
import { listSkills } from "./skills/store.js";
import { executeSlash, maybeDroppedImage, maybeDroppedVideo, type ReplState } from "./repl-commands.js";
import { RESTART_EXIT_CODE } from "./repl/restart-cmd.js";
import { estimateCostUsd, addTurnCost, formatTurnCost } from "./pricing.js";
import { buildModeHint } from "./repl/mode-detect.js";
import { maybeAutoHandoff } from "./repl/auto-handoff.js";
import { groupToolsByDomain } from "./tui/capabilities.js";
import { pruneVolatileSkills } from "./skills/volatile.js";
import {
  prepareRun,
  buildSummarizer,
  consoleCallbacks,
  approver,
  writeRunMemory,
  reviewAfterTurn,
  runPostTurnGates,
  freshGateState,
  maybeCurate,
} from "./session.js";
import { SessionWorkingMemory } from "./memory/working.js";
import { archiveSession } from "./memory/archive.js";
import { loadUserCommands, type UserCommand } from "./commands/loader.js";
import { CheckpointStore } from "./sessions/checkpoint.js";
import { buildCheckpointHandlers } from "./repl/checkpoint-cmd.js";
import { suggestSkillFromRun } from "./projects/commands.js";
import { scoreComplexity, shouldSuggestPlanMode, buildComplexityNote } from "./repl/complexity-gate.js";
import { isTopicShift, buildTopicShiftNote } from "./repl/task-boundary.js";
import { getInProgressItems, buildClosureGateText } from "./repl/closure-gate.js";
import { parseShortcut, runBashShortcut, runMemoryShortcut } from "./repl/shortcuts.js";
import { loadSession, saveSession, newSessionId } from "./sessions/store.js";
import type { Goal } from "./types.js";

const LOGO = String.raw`
   █████╗ ██████╗  ██████╗  ██████╗
  ██╔══██╗██╔══██╗██╔════╝ ██╔═══██╗
  ███████║██████╔╝██║  ███╗██║   ██║
  ██╔══██║██╔══██╗██║   ██║██║   ██║
  ██║  ██║██║  ██║╚██████╔╝╚██████╔╝
  ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝`;

type BannerData = {
  modelId: string;
  root: string;
  goals: Goal[];
  toolNames: string[];
  skillNames: string[];
};

/** The startup banner: logo, model, goals, tool + skill inventory. */
export function renderBanner(d: BannerData): string {
  const active = d.goals.filter((g) => g.status === "active");
  const goalLines = active.length
    ? active.map((g) => `    [${g.id}] ${g.text}`).join("\n")
    : "    (none — add one with: cargo run -- goals add \"...\")";
  const skills = d.skillNames.length
    ? d.skillNames.join(", ")
    : "(none yet — run `modes install`, or the agent writes its own)";
  return [
    LOGO,
    "",
    "  Vanta — trusted operator. Knows the goal, gates every action, reports only verified output.",
    `  model   ${d.modelId}`,
    `  root    ${d.root}`,
    "",
    "  Active goals:",
    goalLines,
    "",
    `  Capabilities (${d.toolNames.length} tools):`,
    ...groupToolsByDomain(d.toolNames).map((g) => `    ${g.label.padEnd(34)} ${g.tools.join(", ")}`),
    "",
    `  Skills: ${skills}`,
    "",
    "  Type a message and press enter. /help for commands, /exit to quit.",
    "",
  ].join("\n");
}

/**
 * Launch the interactive session: print the banner, then a REPL that holds a
 * single conversation (history persists across turns) until /exit. Slash
 * commands are handled by repl-commands.ts; anything else goes to the agent.
 */
export async function runChat(
  repoRoot: string,
  opts: { resumeId?: string } = {},
): Promise<void> {
  const setup = await prepareRun(repoRoot, "interactive session");
  await maybeCurate(); // session-start skill maintenance (best-effort, interval-gated)
  const skills = await listSkills();

  const resumed = opts.resumeId ? await loadSession(opts.resumeId) : null;
  const state: ReplState = {
    sessionId: resumed?.id ?? newSessionId(),
    started: resumed?.started ?? new Date().toISOString(),
    turnIndex: resumed?.messages.filter((m) => m.role === "user").length ?? 0,
  };

  console.log(
    renderBanner({
      modelId: setup.provider.modelId(),
      root: repoRoot,
      goals: setup.goals,
      toolNames: setup.registry.schemas().map((s) => s.name),
      skillNames: skills.map((s) => s.meta.name),
    }),
  );
  if (resumed) {
    const userTurns = resumed.messages.filter((m) => m.role === "user").length;
    console.log(`  ↻ Resumed session ${resumed.id} "${resumed.title}" (${userTurns} turn(s))\n`);
  } else if (opts.resumeId) {
    console.log(`  (no session "${opts.resumeId}" found — starting fresh)\n`);
  }

  let gates = freshGateState();
  let autoHandoffNoted = false;
  const workingMemory = new SessionWorkingMemory();
  const checkpoints = new CheckpointStore();
  const { checkpoint: checkpointHandler, rollback: rollbackHandler } = buildCheckpointHandlers(checkpoints);
  const userCommands: UserCommand[] = await loadUserCommands(process.env);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const convo = createConversation(
    setup.systemPrompt,
    {
      provider: setup.provider,
      safety: setup.safety,
      registry: setup.registry,
      root: repoRoot,
      requestApproval: approver(rl),
      maxIterations: Number(process.env.VANTA_MAX_ITER) || undefined,
      summarize: buildSummarizer(setup.provider),
      activeGoalText: setup.goals.find((g) => g.status === "active")?.text,
      ...consoleCallbacks(),
      onThinking: (t) => console.log(`  ⚙ ${t.split("\n")[0]?.slice(0, 80) ?? ""}`),
    },
    { history: resumed?.messages },
  );

  const ctx = {
    convo,
    setup,
    dataDir: join(repoRoot, ".vanta"),
    state,
    env: process.env,
    now: () => new Date(),
    workingMemory,
  };

  // One user turn: send to the agent + run the full post-turn pipeline. Shared
  // by typed input and by /retry (which re-sends the last message).
  const runUserTurn = async (text: string): Promise<void> => {
    // Drag an image or video into the terminal → path arrives as text; attach it.
    const dropped = await maybeDroppedImage(text);
    if (dropped) {
      (state.pendingImages ??= []).push(dropped);
      text = "Take a look at this image.";
    } else {
      const videoPath = await maybeDroppedVideo(text);
      if (videoPath) text = `Watch this video and describe what you see: ${videoPath}`;
    }
    state.turnIndex++;
    const images = state.pendingImages; // attach + consume any /image, /paste, or drop
    state.pendingImages = undefined;
    const complexityScore = scoreComplexity(text);
    if (shouldSuggestPlanMode(complexityScore, convo.messages, process.env)) {
      console.log(`\n${buildComplexityNote(complexityScore)}`);
    }
    const activeGoal = setup.goals.find((g) => g.status === "active") ?? null;
    if (isTopicShift(text, activeGoal, 0.15)) {
      console.log(`\n${buildTopicShiftNote()}`);
      try {
        const inProgress = getInProgressItems(convo.messages);
        if (inProgress.length) console.log(`\n${buildClosureGateText(inProgress)}`);
      } catch { /* best-effort */ }
    }
    const turnStart = new Date().toISOString();
    const t0 = Date.now();
    // Inject working memory as context prefix when the session has accumulated notes.
    const wmCtx = workingMemory.isEmpty() ? "" : `\n\n${workingMemory.format()}\n\n---\n\n`;
    // MODE-DETECT: prepend a one-line stance hint inferred from the request.
    const modeHint = process.env.VANTA_MODE_DETECT !== "0" ? buildModeHint(text) : null;
    const prefix = `${modeHint ? `${modeHint}\n\n` : ""}${wmCtx}`;
    const outcome = await convo.send(`${prefix}${text}`, images);
    pruneVolatileSkills(convo.messages); // drop one-turn skill bodies from history
    console.log(`\n${outcome.finalText}`);
    if (outcome.usage) {
      // COST-VISIBLE: tokens + latency + cost per turn; accumulate the session split.
      const cost = estimateCostUsd(setup.provider.modelId(), outcome.usage.inputTokens, outcome.usage.outputTokens);
      console.log(`  ${formatTurnCost(outcome.usage.inputTokens, outcome.usage.outputTokens, Date.now() - t0, cost)}`);
      state.sessionCost = addTurnCost(state.sessionCost, process.env.VANTA_PROVIDER, cost);
    }
    // AUTO-HANDOFF: write a resume block when context crosses the threshold (note once).
    const ah = await maybeAutoHandoff({
      estTokens: outcome.usage?.inputTokens ?? Math.round(convo.messages.reduce((n, m) => n + (("content" in m ? m.content : "") ?? "").length, 0) / 4),
      contextWindow: setup.provider.contextWindow(),
      messages: convo.messages,
      sessionId: state.sessionId,
      provider: process.env.VANTA_PROVIDER ?? "unknown",
      model: setup.provider.modelId(),
      repoRoot,
      safety: setup.safety,
      now: new Date(),
    });
    if (ah.wrote && !autoHandoffNoted) {
      console.log(`\n  ↻ context filling up — saved a resume block to ${ah.path} (auto-reloads next launch)`);
      autoHandoffNoted = true;
    }
    await saveSession(state.sessionId, convo.messages, { started: state.started, title: state.title }).catch(() => {});
    await writeRunMemory(setup.provider, setup.goals, text, outcome.finalText, {
      now: turnStart,
      sessionId: state.sessionId,
      turnIndex: state.turnIndex,
    });
    await suggestSkillFromRun(text, process.env);
    await reviewAfterTurn({
      provider: setup.provider,
      safety: setup.safety,
      root: repoRoot,
      transcript: convo.messages,
      toolIterations: outcome.toolIterations,
      turnIndex: state.turnIndex,
    });
    gates = await runPostTurnGates(gates, { messages: convo.messages, safety: setup.safety, dataDir: join(repoRoot, ".vanta"), onNote: (note) => console.log(`\n${note}`) });
  };

  try {
    for (;;) {
      let line: string;
      try {
        line = (await rl.question("\nargo › ")).trim();
      } catch {
        break; // stdin closed (Ctrl+D / EOF / piped input ended) → exit cleanly
      }
      if (!line) continue;
      // Slash commands are /word — file paths dropped from Finder start with /Users/...
      // and have a nested slash in the first token. Route those to runUserTurn, not slash.
      const firstToken = line.slice(1).split(/\s/)[0] ?? "";
      if (line.startsWith("/") && !firstToken.includes("/")) {
        // REL2: checkpoint + rollback handled inline (session-scoped state).
        if (firstToken === "checkpoint") {
          const r = checkpointHandler(line.slice(firstToken.length + 1).trim(), ctx);
          if ("output" in r && r.output) console.log(r.output);
          continue;
        }
        if (firstToken === "rollback") {
          const r = rollbackHandler("", ctx);
          if ("output" in r && r.output) console.log(r.output);
          continue;
        }
        // TUI-CMD: check user-defined commands before the default slash dispatcher.
        const userCmd = userCommands.find((c) => c.name === firstToken);
        if (userCmd) {
          const arg = line.slice(firstToken.length + 2).trim();
          await runUserTurn(arg ? `${userCmd.content}\n\nArgs: ${arg}` : userCmd.content);
          continue;
        }
        const result = await executeSlash(line, ctx);
        if (result.output) console.log(result.output);
        if (result.exit) break;
        if (result.restart) { process.exitCode = RESTART_EXIT_CODE; break; }
        if (result.resend) await runUserTurn(result.resend);
        continue;
      }
      const shortcut = parseShortcut(line);
      if (shortcut) {
        if (shortcut.type === "bash") {
          console.log(await runBashShortcut(shortcut.cmd, setup.safety, repoRoot).catch((e: unknown) => `error: ${e instanceof Error ? e.message : String(e)}`));
        } else {
          console.log(await runMemoryShortcut(shortcut.text, process.env).catch((e: unknown) => `error: ${e instanceof Error ? e.message : String(e)}`));
        }
        continue;
      }
      await runUserTurn(line);
    }
  } finally {
    rl.close();
    // MEM-VERBATIM: archive session messages on exit (best-effort, background).
    archiveSession(state.sessionId, convo.messages, { now: new Date().toISOString() }).catch(() => {});
  }
  // /restart: force a clean code-75 exit so run.sh's loop re-execs (per-turn
  // saveSession already persisted state); skip the "bye." farewell.
  if (process.exitCode === RESTART_EXIT_CODE) process.exit(RESTART_EXIT_CODE);
  console.log("\nbye.");
}
