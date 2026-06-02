import { createInterface } from "node:readline/promises";
import { createConversation } from "./agent.js";
import { listSkills } from "./skills/store.js";
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

const CHAT_HELP = [
  "  Commands:",
  "    /help        show this",
  "    /exit /quit  leave the session",
  "    /skills      list learned skills",
  "  Anything else is sent to the agent. It keeps context across the session.",
].join("\n");

/**
 * Launch the interactive session: print the banner, then a REPL that holds a
 * single conversation (history persists across turns) until /exit.
 */
export async function runChat(repoRoot: string): Promise<void> {
  const setup = await prepareRun(repoRoot, "interactive session");
  await maybeCurate(); // session-start skill maintenance (best-effort, interval-gated)
  const skills = await listSkills();
  console.log(
    renderBanner({
      modelId: setup.provider.modelId(),
      root: repoRoot,
      goals: setup.goals,
      toolNames: setup.registry.schemas().map((s) => s.name),
      skillNames: skills.map((s) => s.meta.name),
    }),
  );

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const convo = createConversation(setup.systemPrompt, {
    provider: setup.provider,
    safety: setup.safety,
    registry: setup.registry,
    root: repoRoot,
    requestApproval: approver(rl),
    maxIterations: Number(process.env.ARGO_MAX_ITER) || undefined,
    summarize: buildSummarizer(setup.provider),
    ...consoleCallbacks(),
  });

  let turnIndex = 0;
  try {
    for (;;) {
      const line = (await rl.question("\nargo › ")).trim();
      if (!line) continue;
      if (line === "/exit" || line === "/quit") break;
      if (line === "/help") {
        console.log(CHAT_HELP);
        continue;
      }
      if (line === "/skills") {
        const list = await listSkills();
        console.log(
          list.length
            ? list.map((s) => `  ${s.meta.name} — ${s.meta.description}`).join("\n")
            : "  (no skills yet)",
        );
        continue;
      }
      turnIndex++;
      const outcome = await convo.send(line);
      console.log(`\n${outcome.finalText}`);
      await writeRunMemory(setup.provider, setup.goals, line, outcome.finalText);
      await suggestSkillFromRun(line, process.env);
      await reviewAfterTurn({
        provider: setup.provider,
        safety: setup.safety,
        root: repoRoot,
        transcript: convo.messages,
        toolIterations: outcome.toolIterations,
        turnIndex,
      });
    }
  } finally {
    rl.close();
  }
  console.log("\nbye.");
}
