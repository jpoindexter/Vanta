import { createInterface } from "node:readline/promises";
import { join } from "node:path";
import { createConversation } from "./agent.js";
import { listSkills } from "./skills/store.js";
import { executeSlash, maybeDroppedImage, maybeDroppedVideo, type ReplState } from "./repl-commands.js";
import { groupToolsByDomain } from "./tui/capabilities.js";
import { pruneVolatileSkills } from "./skills/volatile.js";
import {
  prepareRun,
  buildSummarizer,
  consoleCallbacks,
  approver,
  writeRunMemory,
  reviewAfterTurn,
  researchGateAfterTurn,
  inhibitAfterTurn,
  setShiftAfterTurn,
  scopeDeltaAfterTurn,
  maybeCurate,
  type ResearchGateState,
  type InhibitState,
  type SetShiftState,
  type ScopeDeltaState,
} from "./session.js";
import { suggestSkillFromRun } from "./projects/commands.js";
import { scoreComplexity, shouldSuggestPlanMode, buildComplexityNote } from "./repl/complexity-gate.js";
import { isTopicShift, buildTopicShiftNote } from "./repl/task-boundary.js";
import { getInProgressItems, buildClosureGateText } from "./repl/closure-gate.js";
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
    "  Argo — trusted operator. Knows the goal, gates every action, reports only verified output.",
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

  let researchGateState: ResearchGateState = { consecutiveTurns: 0 };
  let inhibitState: InhibitState = { consecutiveCalls: 0 };
  let setShiftState: SetShiftState = { repeatingTool: null, consecutiveRuns: 0 };
  let scopeDeltaState: ScopeDeltaState = { totalAnnotations: 0 };

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const convo = createConversation(
    setup.systemPrompt,
    {
      provider: setup.provider,
      safety: setup.safety,
      registry: setup.registry,
      root: repoRoot,
      requestApproval: approver(rl),
      maxIterations: Number(process.env.ARGO_MAX_ITER) || undefined,
      summarize: buildSummarizer(setup.provider),
      activeGoalText: setup.goals.find((g) => g.status === "active")?.text,
      ...consoleCallbacks(),
    },
    { history: resumed?.messages },
  );

  const ctx = {
    convo,
    setup,
    dataDir: join(repoRoot, ".argo"),
    state,
    env: process.env,
    now: () => new Date(),
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
    const outcome = await convo.send(text, images);
    pruneVolatileSkills(convo.messages); // drop one-turn skill bodies from history
    console.log(`\n${outcome.finalText}`);
    if (outcome.usage) {
      console.log(`  · ${outcome.usage.inputTokens.toLocaleString()} in / ${outcome.usage.outputTokens.toLocaleString()} out tokens`);
    }
    await saveSession(state.sessionId, convo.messages, { started: state.started, title: state.title }).catch(() => {});
    await writeRunMemory(setup.provider, setup.goals, text, outcome.finalText);
    await suggestSkillFromRun(text, process.env);
    await reviewAfterTurn({
      provider: setup.provider,
      safety: setup.safety,
      root: repoRoot,
      transcript: convo.messages,
      toolIterations: outcome.toolIterations,
      turnIndex: state.turnIndex,
    });
    researchGateState = await researchGateAfterTurn(
      researchGateState,
      convo.messages,
      setup.safety,
      (note) => console.log(`\n${note}`),
    );
    inhibitState = await inhibitAfterTurn(
      inhibitState,
      convo.messages,
      setup.safety,
      (note) => console.log(`\n${note}`),
    );
    setShiftState = await setShiftAfterTurn(
      setShiftState,
      convo.messages,
      (note) => console.log(`\n${note}`),
    );
    scopeDeltaState = await scopeDeltaAfterTurn(
      scopeDeltaState,
      convo.messages,
      (note) => console.log(`\n${note}`),
    );
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
        const result = await executeSlash(line, ctx);
        if (result.output) console.log(result.output);
        if (result.exit) break;
        if (result.resend) await runUserTurn(result.resend);
        continue;
      }
      await runUserTurn(line);
    }
  } finally {
    rl.close();
  }
  console.log("\nbye.");
}
