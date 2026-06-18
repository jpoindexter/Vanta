import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createConversation } from "../agent.js";
import { buildSystemPrompt } from "../prompt.js";
import { listSkills } from "../skills/store.js";
import { resolveBrain } from "../brain/interface.js";
import { buildAgentHookDeps } from "../hooks/agent-hook-deps.js";
import { fireHooks } from "../hooks/shell-hooks.js";
import type { AgentDeps, AgentOutcome } from "../agent.js";
import type { Goal, Message } from "../types.js";

const DEFAULT_MAX_ITERATIONS = 50;

/**
 * Spawn an isolated worker agent for a single scoped subtask.
 *
 * The worker gets a FRESH system prompt with only its one goal injected and its
 * own messages array (built inside runAgent). It cannot mutate the parent — it
 * shares no mutable state and only returns its verified outcome. The caller is
 * responsible for passing a registry that already excludes `delegate` so the
 * worker cannot recursively spawn.
 */
export async function spawnSubagent(opts: {
  goal: string;
  instruction: string;
  deps: AgentDeps;
  maxIterations?: number;
  soulPath?: string;
  // Injected for deterministic tests; defaults to wall-clock at call time.
  now?: Date;
}): Promise<AgentOutcome> {
  const { deps } = opts;
  const now = (opts.now ?? new Date()).toISOString();
  const dataDir = join(deps.root, ".vanta");
  await fireHooks(dataDir, "SubagentStart", { goal: opts.goal, instruction: opts.instruction }, { cwd: deps.root, matcherValue: "general-purpose", ...buildAgentHookDeps(deps) });
  const goals: Goal[] = [{ id: 0, text: opts.goal, status: "active" }];
  // Workers are as aware as the parent: they see the skill index + the brain.
  const skills = (await listSkills(process.env).catch(() => [])).map((s) => ({
    name: s.meta.name,
    description: s.meta.description,
  }));
  const brain = await resolveBrain(process.env).digest(process.env).catch(() => "");
  const systemPrompt = await buildSystemPrompt({
    root: deps.root,
    soulPath: opts.soulPath ?? join(deps.root, "SOUL.md"),
    goals,
    tools: deps.registry.schemas(),
    now,
    skills,
    brain,
  });
  const convo = createConversation(systemPrompt, { ...deps, maxIterations: opts.maxIterations ?? DEFAULT_MAX_ITERATIONS });
  try {
    const outcome = await convo.send(opts.instruction);
    await persistSidechain({ root: deps.root, goal: opts.goal, instruction: opts.instruction, model: deps.provider.modelId(), createdAt: now, outcome, messages: convo.messages });
    await fireHooks(dataDir, "SubagentStop", { goal: opts.goal, result: outcome.finalText, stoppedReason: outcome.stoppedReason }, { cwd: deps.root, matcherValue: "general-purpose", ...buildAgentHookDeps(deps) });
    return outcome;
  } catch (err) {
    await persistSidechain({ root: deps.root, goal: opts.goal, instruction: opts.instruction, model: deps.provider.modelId(), createdAt: now, error: err instanceof Error ? err.message : String(err), messages: convo.messages });
    await fireHooks(dataDir, "SubagentStop", { goal: opts.goal, error: err instanceof Error ? err.message : String(err) }, { cwd: deps.root, matcherValue: "general-purpose", ...buildAgentHookDeps(deps) });
    throw err;
  }
}

async function persistSidechain(o: {
  root: string;
  goal: string;
  instruction: string;
  model: string;
  createdAt: string;
  outcome?: AgentOutcome;
  error?: string;
  messages: Message[];
}): Promise<void> {
  const dir = join(o.root, ".vanta", "sidechains");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${o.createdAt.replace(/[:.]/g, "-")}-${randomUUID()}.json`);
  const record = {
    goal: o.goal,
    instruction: o.instruction,
    model: o.model,
    createdAt: o.createdAt,
    outcome: o.outcome,
    error: o.error,
    messages: o.messages,
  };
  await writeFile(file, `${JSON.stringify({ version: 1, ...record }, null, 2)}\n`);
}
