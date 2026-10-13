import { randomUUID } from "node:crypto";
import type { WorkProductKind } from "../cofounder/work-products.js";
import type { Worker } from "../team/store.js";
import type { WorkerTask } from "../team/tasks.js";
import type { Goal } from "../types.js";
import type { RunEvent } from "../worker-runtimes/types.js";
import type { RuntimeSeams } from "./company-run-select.js";
import type { DesktopState } from "./handler-state.js";

// Injectable seams for the company API. Production uses the defaults; tests
// replace the runtime (a stub that writes a work product) without touching the
// real stores, which stay on disk under an isolated VANTA_HOME.

export type WorkerRunRequest = {
  worker: Worker;
  task: WorkerTask;
  instruction: string;
  env: NodeJS.ProcessEnv;
  /** Aborted when the owner pauses the worker; stop at the next safe point. */
  signal: AbortSignal;
  /** Heartbeat: call whenever the worker shows signs of life. */
  progress: (note: string) => void;
  /** Project directory the run works in. Present for runs started by the company engine. */
  cwd?: string;
  runId?: string;
  /** Structured progress (tool use, messages); the engine logs it to the activity feed. */
  onEvent?: (event: RunEvent) => void;
  /** Spend left for this worker across its agent and department budgets. Absent when unbudgeted. */
  maxBudgetUsd?: number;
};

export type RunCost = { usd: number; basis: "reported" | "estimated" };

/** What a run spent. Present on a failure too: an external CLI that stopped partway still billed. */
export type RunSpend = {
  usage?: { inputTokens: number; outputTokens: number };
  /** Omit when the runtime has no dollar figure: the run is recorded as not-reported. */
  cost?: RunCost;
  provider?: string;
  model?: string;
};

export type WorkerRunResult =
  | ({ ok: true; summary: string; artifacts: Array<{ artifact: string; kind?: WorkProductKind }> } & RunSpend)
  | ({ ok: false; error: string } & RunSpend);

export type WorkerRuntime = { id: string; run: (request: WorkerRunRequest) => Promise<WorkerRunResult> };

export type CompanyPorts = {
  /** The runtime for a hired worker: the Vanta loop for a provider adapter, an external CLI for "cli:<id>". */
  runtime: (state: DesktopState, worker?: Worker) => WorkerRuntime | Promise<WorkerRuntime>;
  /** Test seams for external CLI workers (fake process, detection, kernel). Production leaves it unset. */
  runtimeSeams?: RuntimeSeams;
  /** Kernel goals when a live session exists; [] otherwise. Never starts a kernel. */
  readGoals: (state: DesktopState) => Promise<Goal[]>;
  newId: () => string;
  now: () => Date;
};

type SafetyLike = { getGoals?: () => Promise<Goal[]> };

async function defaultReadGoals(state: DesktopState): Promise<Goal[]> {
  const safety = state.setup?.safety as SafetyLike | undefined;
  if (typeof safety?.getGoals !== "function") return [];
  return safety.getGoals().catch(() => state.setup?.goals ?? []);
}

async function defaultRuntime(state: DesktopState, worker?: Worker): Promise<WorkerRuntime> {
  const { selectRuntime } = await import("./company-run-select.js");
  return selectRuntime(state, worker);
}

const DEFAULTS: CompanyPorts = {
  runtime: defaultRuntime,
  readGoals: defaultReadGoals,
  newId: () => randomUUID().slice(0, 8),
  now: () => new Date(),
};

let current: CompanyPorts = DEFAULTS;

export function companyPorts(): CompanyPorts {
  return current;
}

/** Test seam: override any subset of the ports. */
export function setCompanyPorts(override: Partial<CompanyPorts>): void {
  current = { ...DEFAULTS, ...override };
}

export function resetCompanyPorts(): void {
  current = DEFAULTS;
}
