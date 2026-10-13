import type { WorkerRuntime as EnginePort, WorkerRunRequest, WorkerRunResult } from "../desktop/company-ports.js";
import { ARTIFACT_MAX_CHARS, SUMMARY_MAX_CHARS } from "./constants.js";
import type { RunInput, RunOutput, WorkerRuntime } from "./types.js";

// Adapts a registry WorkerRuntime to the company engine's port, the seam the
// run engine already supervises (checkout, budget gate, pause, work products,
// outcome and review gates). The engine stays the only thing that closes tickets.

function inputFor(request: WorkerRunRequest, cwd: string): RunInput {
  const { worker, task } = request;
  return {
    ticket: {
      id: task.id,
      title: task.title,
      workerId: worker.id,
      role: worker.role,
      runId: request.runId ?? task.id,
      ...(worker.adapter ? { adapter: worker.adapter } : {}),
      ...(worker.model ? { model: worker.model } : {}),
      ...(task.outcome?.expectedOutput ? { expectedOutput: task.outcome.expectedOutput } : {}),
    },
    instruction: request.instruction,
    cwd,
    signal: request.signal,
    onEvent: (event) => { request.progress(event.text); request.onEvent?.(event); },
    ...(request.maxBudgetUsd !== undefined ? { maxBudgetUsd: request.maxBudgetUsd } : {}),
  };
}

/** Tokens only count as reported when the CLI gave both figures; a half figure would read as zero. */
function usageFor(output: RunOutput): { inputTokens: number; outputTokens: number } | undefined {
  const usage = output.usage;
  return usage?.inputTokens !== undefined && usage.outputTokens !== undefined ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } : undefined;
}

export function resultFor(output: RunOutput, runtimeId: string): WorkerRunResult {
  if (output.status !== "completed") return { ok: false, error: output.error ?? output.summary };
  const usage = usageFor(output);
  const cost = output.usage?.costUsd;
  return {
    ok: true,
    summary: output.summary.slice(0, SUMMARY_MAX_CHARS),
    artifacts: output.workProducts.map((product) => ({ artifact: product.content.slice(0, ARTIFACT_MAX_CHARS), kind: product.kind })),
    ...(usage ? { usage } : {}),
    ...(typeof cost === "number" ? { cost: { usd: cost, basis: "reported" as const } } : {}),
    provider: runtimeId,
    ...(output.model ? { model: output.model } : {}),
  };
}

export function toEnginePort(runtime: WorkerRuntime, run: (input: RunInput) => Promise<RunOutput> = (input) => runtime.run(input)): EnginePort {
  return {
    id: runtime.id,
    async run(request) {
      if (!request.cwd) return { ok: false, error: `the company engine gave ${runtime.id} no working directory` };
      return resultFor(await run(inputFor(request, request.cwd)), runtime.id);
    },
  };
}
