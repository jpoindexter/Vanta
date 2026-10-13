import type { WorkerRuntime as EnginePort, WorkerRunRequest, WorkerRunResult } from "../desktop/company-ports.js";
import type { Worker } from "../team/store.js";
import type { WorkerTask } from "../team/tasks.js";
import { NATIVE_RUNTIME_ID } from "./constants.js";
import { failedOutput, type RunInput, type RunOutput, type WorkerRuntime } from "./types.js";

// The Vanta native loop behind the WorkerRuntime interface. It wraps the
// company engine's existing port (company-native-runtime.ts), so there is one
// in-process loop and one set of kernel-gated tools, not a second one.

export type NativeRuntimeDeps = {
  /** Creates the engine port that really runs the loop (needs a live desktop session). */
  port: () => Promise<EnginePort>;
  env: NodeJS.ProcessEnv;
  now?: () => Date;
};

function requestFor(input: RunInput, deps: NativeRuntimeDeps): WorkerRunRequest {
  const at = (deps.now ?? (() => new Date()))().toISOString();
  const { ticket } = input;
  const worker: Worker = { kind: "worker", id: ticket.workerId, role: ticket.role, status: "running", ts: at, ...(ticket.adapter ? { adapter: ticket.adapter } : {}), ...(ticket.model ? { model: ticket.model } : {}) };
  const task: WorkerTask = { kind: "task", id: ticket.id, workerId: ticket.workerId, title: ticket.title, status: "running", created: at, updated: at };
  return { worker, task, instruction: input.instruction, env: deps.env, signal: input.signal, progress: (text) => input.onEvent({ kind: "status", text: text.slice(0, 500) }), cwd: input.cwd, runId: ticket.runId, onEvent: input.onEvent, maxBudgetUsd: input.maxBudgetUsd };
}

function outputFor(result: WorkerRunResult): RunOutput {
  if (!result.ok) return failedOutput(result.error);
  return {
    status: "completed",
    summary: result.summary,
    workProducts: result.artifacts.map((a) => ({ kind: a.kind === "code" ? "code" : "report", source: "final-message", content: a.artifact, files: [] })),
    ...(result.usage || result.cost ? { usage: { ...result.usage, costUsd: result.cost ? result.cost.usd : null } } : {}),
    ...(result.model ? { model: result.model } : {}),
  };
}

export function createNativeWorkerRuntime(deps: NativeRuntimeDeps): WorkerRuntime {
  return {
    id: NATIVE_RUNTIME_ID,
    displayName: "Vanta",
    selfApproving: false,
    detect: async () => ({ runtimeId: NATIVE_RUNTIME_ID, installed: true, command: null, version: null, auth: "not-applicable", selfApproving: false }),
    run: async (input) => outputFor(await (await deps.port()).run(requestFor(input, deps))),
  };
}
