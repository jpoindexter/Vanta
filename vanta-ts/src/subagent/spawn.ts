import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { randomUUID } from "node:crypto";
import { createConversation } from "../agent.js";
import { buildSystemPrompt } from "../prompt.js";
import { listSkills } from "../skills/store.js";
import { resolveBrain } from "../brain/interface.js";
import { buildAgentHookDeps } from "../hooks/agent-hook-deps.js";
import { fireHooks } from "../hooks/shell-hooks.js";
import { startProgressReporter } from "./progress-reporter.js";
import { resolveSpawnDepth, checkSpawnDepth, withSpawnDepth } from "./spawn-guard.js";
import type { RecentCall } from "./progress.js";
import type { SpawnGuardOptions, SpawnGuardVerdict } from "./spawn-guard.js";
import type { AgentDeps, AgentOutcome } from "../agent.js";
import type { Goal, Message } from "../types.js";
import type { PromptPreset } from "../prompt/presets.js";

type WorkerOpts = {
  goal: string;
  instruction: string;
  deps: AgentDeps;
  maxIterations?: number;
  soulPath?: string;
  /** Bounded role overlay; the standard Vanta prompt and kernel contract remain. */
  promptPreset?: PromptPreset;
  // Injected for deterministic tests; defaults to wall-clock at call time.
  now?: Date;
};

const DEFAULT_MAX_ITERATIONS = 50;
const RECENT_CALLS_CAP = 8;

/**
 * Tee the worker's tool calls into a small ring buffer (preserving any caller
 * onToolCall) so the progress reporter can name the specific file/symbol in
 * flight. Returns wrapped deps + a reader for the latest calls.
 */
function withProgressCapture(deps: AgentDeps): { deps: AgentDeps; getRecentCalls: () => RecentCall[]; getToolNames: () => string[] } {
  const recent: RecentCall[] = [];
  const tools = new Set<string>();
  const prior = deps.onToolCall;
  return {
    deps: {
      ...deps,
      onToolCall: (name, args) => {
        tools.add(name);
        recent.push({ name, args });
        if (recent.length > RECENT_CALLS_CAP) recent.shift();
        prior?.(name, args);
      },
    },
    getRecentCalls: () => [...recent],
    getToolNames: () => [...tools],
  };
}

/**
 * Spawn an isolated worker agent for a single scoped subtask.
 *
 * The worker gets a FRESH system prompt with only its one goal injected and its
 * own messages array (built inside runAgent). It cannot mutate the parent — it
 * shares no mutable state and only returns its verified outcome. The caller is
 * responsible for passing a registry that already excludes `delegate` so the
 * worker cannot recursively spawn.
 */
export async function spawnSubagent(
  opts: WorkerOpts & {
    /** Spawn depth of this call's parent; defaults to the VANTA_SPAWN_DEPTH seed.
     * The child runs at depth+1, and the kernel refuses runaway depth. */
    depth?: number;
    /** Injected for tests; defaults to the real kernel spawn-depth guard. */
    checkSpawn?: (o: SpawnGuardOptions) => Promise<SpawnGuardVerdict>;
  },
): Promise<AgentOutcome> {
  const childDepth = (opts.depth ?? resolveSpawnDepth(process.env)) + 1;
  const guard = await (opts.checkSpawn ?? checkSpawnDepth)({
    parent: spawnLabel(opts.goal, "agent"),
    child: spawnLabel(opts.instruction, "worker"),
    depth: childDepth,
  });
  if (!guard.allowed) return blockedOutcome(`Spawn refused by kernel: ${guard.reason}`);
  return withSpawnDepth(childDepth, () => runWorker(opts));
}

/** Truncate a goal/instruction to a short single-line ledger label. */
function spawnLabel(text: string, fallback: string): string {
  const t = text.trim().replace(/\s+/g, " ").slice(0, 60);
  return t.length > 0 ? t : fallback;
}

function blockedOutcome(finalText: string): AgentOutcome {
  return { finalText, iterations: 0, stoppedReason: "interrupted", toolIterations: 0 };
}

async function runWorker(opts: WorkerOpts): Promise<AgentOutcome> {
  const { deps: runDeps, getRecentCalls, getToolNames } = withProgressCapture(opts.deps);
  const deps = runDeps;
  const now = (opts.now ?? new Date()).toISOString();
  const started = Date.now();
  const dataDir = join(deps.root, ".vanta");
  const agentType = opts.promptPreset?.name ?? "general-purpose";
  await fireHooks(dataDir, "SubagentStart", { goal: opts.goal, instruction: opts.instruction, agentType }, { cwd: deps.root, matcherValue: agentType, ...buildAgentHookDeps(deps) });
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
    promptPreset: opts.promptPreset,
  });
  const convo = createConversation(systemPrompt, { ...deps, maxIterations: opts.maxIterations ?? DEFAULT_MAX_ITERATIONS });
  // Live footer pill: shows immediately (title), then a ~30s-throttled side-query
  // names the file/symbol in flight. Sub-30s workers stop before billing one.
  const stopProgress = startProgressReporter({ id: randomUUID(), goal: opts.goal, provider: deps.provider, getRecentCalls });
  try {
    const outcome = await convo.send(opts.instruction);
    const rawSidechain = await persistSidechain({ root: deps.root, goal: opts.goal, instruction: opts.instruction, agentType, model: deps.provider.modelId(), createdAt: now, outcome, messages: convo.messages });
    await fireHooks(dataDir, "SubagentStop", { goal: opts.goal, result: outcome.finalText, stoppedReason: outcome.stoppedReason, agentType }, { cwd: deps.root, matcherValue: agentType, ...buildAgentHookDeps(deps) });
    return { ...outcome, workerEvidence: { rawSidechain, tools: getToolNames(), durationMs: Date.now() - started, model: deps.provider.modelId() } };
  } catch (err) {
    await persistSidechain({ root: deps.root, goal: opts.goal, instruction: opts.instruction, agentType, model: deps.provider.modelId(), createdAt: now, error: err instanceof Error ? err.message : String(err), messages: convo.messages });
    await fireHooks(dataDir, "SubagentStop", { goal: opts.goal, error: err instanceof Error ? err.message : String(err), agentType }, { cwd: deps.root, matcherValue: agentType, ...buildAgentHookDeps(deps) });
    throw err;
  } finally {
    stopProgress();
  }
}

async function persistSidechain(o: {
  root: string;
  goal: string;
  instruction: string;
  agentType: string;
  model: string;
  createdAt: string;
  outcome?: AgentOutcome;
  error?: string;
  messages: Message[];
}): Promise<string> {
  const dir = join(o.root, ".vanta", "sidechains");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${o.createdAt.replace(/[:.]/g, "-")}-${randomUUID()}.json`);
  const record = {
    goal: o.goal,
    instruction: o.instruction,
    agentType: o.agentType,
    model: o.model,
    createdAt: o.createdAt,
    outcome: o.outcome,
    error: o.error,
    messages: o.messages,
  };
  await writeFile(file, `${JSON.stringify({ version: 1, ...record }, null, 2)}\n`);
  return relative(o.root, file);
}
