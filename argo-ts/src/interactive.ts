import { createInterface } from "node:readline/promises";
import { join } from "node:path";
import { createConversation } from "./agent.js";
import { listSkills } from "./skills/store.js";
import { runSlashCommand, type ReplState } from "./repl-commands.js";
import {
  prepareRun,
  buildSummarizer,
  consoleCallbacks,
  approver,
  writeRunMemory,
  reviewAfterTurn,
  maybeCurate,
} from "./session.js";
import { suggestSkillFromRun } from "./projects/commands.js";
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
    `  Tools (${d.toolNames.length}): ${d.toolNames.join(", ")}`,
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

  try {
    for (;;) {
      let line: string;
      try {
        line = (await rl.question("\nargo › ")).trim();
      } catch {
        break; // stdin closed (Ctrl+D / EOF / piped input ended) → exit cleanly
      }
      if (!line) continue;
      if (line.startsWith("/")) {
        if (await runSlashCommand(line, ctx)) break;
        continue;
      }
      state.turnIndex++;
      const outcome = await convo.send(line);
      console.log(`\n${outcome.finalText}`);
      await saveSession(state.sessionId, convo.messages, { started: state.started }).catch(() => {});
      await writeRunMemory(setup.provider, setup.goals, line, outcome.finalText);
      await suggestSkillFromRun(line, process.env);
      await reviewAfterTurn({
        provider: setup.provider,
        safety: setup.safety,
        root: repoRoot,
        transcript: convo.messages,
        toolIterations: outcome.toolIterations,
        turnIndex: state.turnIndex,
      });
    }
  } finally {
    rl.close();
  }
  console.log("\nbye.");
}
