import type { RunSpend, WorkerRuntime as EnginePort, WorkerRunRequest, WorkerRunResult } from "../desktop/company-ports.js";
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
function spendFor(output: RunOutput, runtimeId: string): RunSpend {
  const { inputTokens, outputTokens, costUsd } = output.usage ?? {};
  return {
    ...(inputTokens !== undefined && outputTokens !== undefined ? { usage: { inputTokens, outputTokens } } : {}),
    ...(typeof costUsd === "number" ? { cost: { usd: costUsd, basis: "reported" as const } } : {}),
    provider: runtimeId,
    ...(output.model ? { model: output.model } : {}),
  };
}

export function resultFor(output: RunOutput, runtimeId: string): WorkerRunResult {
  const spend = spendFor(output, runtimeId);
  if (output.status !== "completed") return { ok: false, error: output.error ?? output.summary, ...spend };
  return {
    ok: true,
    summary: output.summary.slice(0, SUMMARY_MAX_CHARS),
    artifacts: output.workProducts.map((product) => ({ artifact: product.content.slice(0, ARTIFACT_MAX_CHARS), kind: product.kind })),
    ...spend,
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
