import { join } from "node:path";
import { runAgent } from "../agent.js";
import { buildSystemPrompt } from "../prompt.js";
import { listSkills } from "../skills/store.js";
import { brainDigest } from "../brain/brain.js";
import type { AgentDeps, AgentOutcome } from "../agent.js";
import type { Goal } from "../types.js";

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
  const goals: Goal[] = [{ id: 0, text: opts.goal, status: "active" }];
  // Workers are as aware as the parent: they see the skill index + the brain.
  const skills = (await listSkills(process.env).catch(() => [])).map((s) => ({
    name: s.meta.name,
    description: s.meta.description,
  }));
  const brain = await brainDigest(process.env).catch(() => "");
  const systemPrompt = await buildSystemPrompt({
    root: deps.root,
    soulPath: opts.soulPath ?? join(deps.root, "SOUL.md"),
    goals,
    tools: deps.registry.schemas(),
    now,
    skills,
    brain,
  });
  return runAgent(systemPrompt, opts.instruction, {
    ...deps,
    maxIterations: opts.maxIterations ?? DEFAULT_MAX_ITERATIONS,
  });
}
