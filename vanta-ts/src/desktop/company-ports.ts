import { randomUUID } from "node:crypto";
import type { WorkProductKind } from "../cofounder/work-products.js";
import type { Worker } from "../team/store.js";
import type { WorkerTask } from "../team/tasks.js";
import type { Goal } from "../types.js";
import type { DesktopState } from "./handler-state.js";

// Injectable seams for the company API. Production uses the defaults; tests
// replace the runtime (a stub that writes a work product) without touching the
// real stores, which stay on disk under an isolated VANTA_HOME.

export type WorkerRunRequest = {
  worker: Worker;
  task: WorkerTask;
  instruction: string;
  env: NodeJS.ProcessEnv;
  /** Heartbeat: call whenever the worker shows signs of life. */
  progress: (note: string) => void;
};

export type RunCost = { usd: number; basis: "reported" | "estimated" };

export type WorkerRunResult =
  | {
      ok: true;
      summary: string;
      artifacts: Array<{ artifact: string; kind?: WorkProductKind }>;
      usage?: { inputTokens: number; outputTokens: number };
      /** Omit when the runtime has no dollar figure: the run is recorded as not-reported. */
      cost?: RunCost;
      provider?: string;
      model?: string;
    }
  | { ok: false; error: string };

export type WorkerRuntime = { id: string; run: (request: WorkerRunRequest) => Promise<WorkerRunResult> };

export type CompanyPorts = {
  runtime: (state: DesktopState) => WorkerRuntime | Promise<WorkerRuntime>;
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

async function defaultRuntime(state: DesktopState): Promise<WorkerRuntime> {
  const { createNativeRuntime } = await import("./company-native-runtime.js");
  return createNativeRuntime(state);
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
