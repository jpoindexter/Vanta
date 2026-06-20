import { z } from "zod";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { spawnSubagent } from "../subagent/spawn.js";
import { enqueueAsyncResult } from "../subagent/async-delegate.js";
import { resolveProvider } from "../providers/index.js";
import { buildRegistry } from "./index.js";

const Args = z.object({
  goal: z.string().min(1),
  instruction: z.string().min(1),
  max_iterations: z.number().int().min(1).max(50).optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  isolation: z.enum(["worktree"]).optional(),
  background: z.boolean().optional(),
});

/** Env for the worker — overlay the agent's chosen provider/model over the parent's. */
export function delegateEnv(
  env: NodeJS.ProcessEnv,
  provider?: string,
  model?: string,
): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = { ...env };
  if (provider) merged.VANTA_PROVIDER = provider;
  if (model) merged.VANTA_MODEL = model;
  return merged;
}

type DelegateArgs = import("zod").infer<typeof Args>;

async function resolveWorktree(
  root: string,
  isolation: DelegateArgs["isolation"],
): Promise<{ handle: import("../worktree/manager.js").WorktreeHandle | undefined; workerRoot: string } | { ok: false; output: string }> {
  if (isolation !== "worktree") return { handle: undefined, workerRoot: root };
  const { createWorktree } = await import("../worktree/manager.js");
  try {
    const handle = await createWorktree(root, "agent/worktree");
    return { handle, workerRoot: handle.path };
  } catch (err) {
    return { ok: false, output: `worktree creation failed: ${(err as Error).message}` };
  }
}

async function runDelegate(
  data: DelegateArgs,
  ctx: import("./types.js").ToolContext,
): Promise<import("./types.js").ToolResult> {
  const { goal, instruction, max_iterations: maxIterations, provider: prov, model, isolation } = data;

  let provider;
  try {
    provider = resolveProvider(delegateEnv(process.env, prov, model));
  } catch (err) {
    return { ok: false, output: `cannot use ${prov ?? "default"}/${model ?? "default"}: ${(err as Error).message}` };
  }

  // Child cannot spawn further delegates — prevents runaway recursion.
  const registry = buildRegistry({ exclude: ["delegate"] });

  const wt = await resolveWorktree(ctx.root, isolation);
  if ("ok" in wt && !wt.ok) return wt;
  const { handle: worktreeHandle, workerRoot } = wt as { handle: import("../worktree/manager.js").WorktreeHandle | undefined; workerRoot: string };
  const { mountMcpServers } = await import("../mcp/mount.js");
  await mountMcpServers(registry, process.env, () => {}, { cwd: workerRoot });

  try {
    const outcome = await spawnSubagent({
      goal,
      instruction,
      deps: {
        provider,
        safety: ctx.safety,
        registry,
        root: workerRoot,
        requestApproval: ctx.requestApproval,
        maxIterations,
      },
      maxIterations,
    });
    const prefix = worktreeHandle ? `[worktree:${worktreeHandle.branch}] ` : "";
    return { ok: true, output: `${prefix}[worker:${outcome.stoppedReason}] ${outcome.finalText}` };
  } finally {
    if (worktreeHandle) await worktreeHandle.cleanup().catch(() => {});
  }
}

/** VANTA-ASYNC-DELEGATE: kick off the worker detached — return an ack in ~ms; on
 * completion enqueue the result so the REPL re-enters it as a new turn when idle.
 * runDelegate's own worktree cleanup runs in its finally when the promise settles. */
function startBackgroundDelegate(data: DelegateArgs, ctx: ToolContext): ToolResult {
  const id = randomUUID();
  const dataDir = join(ctx.root, ".vanta");
  const finishedAt = () => new Date().toISOString();
  void runDelegate(data, ctx)
    .then((r) => enqueueAsyncResult(dataDir, { id, goal: data.goal, output: r.output, finishedAt: finishedAt() }))
    .catch((e) => enqueueAsyncResult(dataDir, { id, goal: data.goal, output: `error: ${(e as Error).message}`, finishedAt: finishedAt() }));
  return { ok: true, output: `delegated in background (id=${id.slice(0, 8)}) — result will re-enter as a new turn when idle` };
}

export const delegateTool: Tool = {
  schema: {
    name: "delegate",
    description:
      "Delegate a scoped subtask to a worker agent — optionally on a DIFFERENT model/provider. " +
      "The worker runs its own loop with the same tools (minus delegate) and returns its result. " +
      "Use `provider`/`model` to route a subtask to the best backend (e.g. provider:'ollama' for a " +
      "free local model, provider:'openai' model:'gpt-4o' for a hard reasoning step). Call it multiple " +
      "times to fan a goal out across several workers/models.",
    parameters: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description: "The worker's scoped goal — the outcome to achieve",
        },
        instruction: {
          type: "string",
          description: "Concrete instructions for the worker to follow",
        },
        max_iterations: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Optional cap on the worker's loop iterations (1-50)",
        },
        provider: {
          type: "string",
          description: "Optional backend for the worker: openai | ollama | anthropic | gemini | openrouter | codex | claude-code. Defaults to the parent's.",
        },
        model: {
          type: "string",
          description: "Optional model id for the worker (e.g. gpt-4o, qwen2.5:14b, gemini-2.5-flash).",
        },
        isolation: {
          type: "string",
          enum: ["worktree"],
          description: "Set to 'worktree' to run the agent in a fresh git worktree on a new branch so parallel agents don't conflict.",
        },
        background: {
          type: "boolean",
          description: "Run the worker in the BACKGROUND: the call returns immediately and the worker's result re-enters as a new turn when the session is idle. Use for long subtasks you don't need to block on.",
        },
      },
      required: ["goal", "instruction"],
    },
  },
  // Constant string by design: delegation is an internal orchestration op. The
  // worker's own tool calls are each assessed by the kernel as they happen, so
  // echoing the goal/instruction here would only let their content false-trigger
  // the safety classifier.
  describeForSafety: () => "delegate a subtask to a worker agent",
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: "delegate needs goal and instruction strings" };
    }
    if (parsed.data.background) return startBackgroundDelegate(parsed.data, ctx);
    try {
      return await runDelegate(parsed.data, ctx);
    } catch (err) {
      return { ok: false, output: (err as Error).message };
    }
  },
};
