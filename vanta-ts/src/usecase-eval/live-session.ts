import { join } from "node:path";
import { createConversation } from "../agent.js";
import { prepareRun, buildSummarizer } from "../session.js";
import { withFrozen } from "../evolve/snapshot.js";
import { resolveVantaHome } from "../store/home.js";
import { runScriptedTurns, type ScriptedScenario, type ScriptedStoryReceipt, type StoryToolEvent } from "./multiturn.js";

export async function runLiveStory(repoRoot: string, scenario: ScriptedScenario): Promise<ScriptedStoryReceipt> {
  const setup = await prepareRun(repoRoot, scenario.instruction);
  const events: StoryToolEvent[] = [];
  let approvalGranted = false;
  const convo = createConversation(setup.systemPrompt, {
    provider: setup.provider,
    safety: setup.safety,
    registry: setup.registry,
    root: repoRoot,
    requestApproval: async () => approvalGranted,
    maxIterations: Number(process.env.VANTA_MAX_ITER) || undefined,
    summarize: buildSummarizer(setup.provider),
    onToolResult: (name, ok, output) => events.push({ name, ok, output: redactStoryText(output) }),
  });
  const brainDir = join(resolveVantaHome(process.env), "brain");
  return withFrozen(brainDir, () => runScriptedTurns(scenario, {
    send: async (text) => {
      approvalGranted = /^approve\b/i.test(text.trim());
      return convo.send(text);
    },
    drainToolEvents: () => events.splice(0),
    redact: redactStoryText,
  }));
}

export function redactStoryText(text: string): string {
  return text
    .replace(/\b(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,})\b/g, "[REDACTED_TOKEN]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]{12,}/gi, "$1[REDACTED]")
    .slice(-4_000);
}
