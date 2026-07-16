import { z } from "zod";

export const TASK_ENVIRONMENT_VERSION = "1" as const;

export const SideEffectClassSchema = z.enum(["none", "reversible", "external"]);
export type SideEffectClass = z.infer<typeof SideEffectClassSchema>;

export type TaskErrorCode = "invalid_action" | "malformed_observation" | "malformed_snapshot" | "controlled_commit_required";
export type TaskError = { code: TaskErrorCode; message: string };
export type Prediction = { summary: string };
export type VerifierResult = { ok: boolean; summary: string };

export type TaskEnvironment<Snapshot, Observation, Action> = {
  version: typeof TASK_ENVIRONMENT_VERSION;
  id: string;
  sideEffect: SideEffectClass;
  snapshotSchema: z.ZodType<Snapshot>;
  observationSchema: z.ZodType<Observation>;
  legalActions: z.ZodType<Action>;
  snapshot: () => unknown;
  observe: () => Promise<unknown> | unknown;
  predict: (snapshot: Snapshot, action: Action) => Prediction;
  act: (action: Action) => Promise<unknown> | unknown;
  terminal: (snapshot: Snapshot) => string | undefined;
  verify: (snapshot: Snapshot, observation: Observation) => Promise<VerifierResult> | VerifierResult;
};

export type TaskTransition<Snapshot, Observation, Action> = {
  action: Action;
  before: { snapshot: Snapshot; observation: Observation };
  prediction: Prediction;
  observed: Observation;
  after: Snapshot;
  terminal?: string;
  verification: VerifierResult;
};

export type TaskStepResult<Snapshot, Observation, Action> =
  | { ok: true; transition: TaskTransition<Snapshot, Observation, Action> }
  | { ok: false; error: TaskError };

export type ReplayResult<Snapshot, Observation, Action> =
  | { ok: true; transitions: TaskTransition<Snapshot, Observation, Action>[] }
  | { ok: false; transitions: TaskTransition<Snapshot, Observation, Action>[]; error: TaskError };

function failure(code: TaskErrorCode): { ok: false; error: TaskError } {
  return { ok: false, error: { code, message: code.replace(/_/g, " ") } };
}

function parse<Value>(schema: z.ZodType<Value>, value: unknown): Value | undefined {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

async function beforeStep<Snapshot, Observation, Action>(
  environment: TaskEnvironment<Snapshot, Observation, Action>,
  rawAction: unknown,
): Promise<{ snapshot: Snapshot; observation: Observation; action: Action } | { error: TaskError }> {
  const snapshot = parse(environment.snapshotSchema, environment.snapshot());
  if (!snapshot) return { error: failure("malformed_snapshot").error };
  const observation = parse(environment.observationSchema, await environment.observe());
  if (!observation) return { error: failure("malformed_observation").error };
  const action = parse(environment.legalActions, rawAction);
  return action ? { snapshot, observation, action } : { error: failure("invalid_action").error };
}

/** Execute side-effect-free fixtures only. Reversible/external work must use commitActions. */
export async function runTaskStep<Snapshot, Observation, Action>(
  environment: TaskEnvironment<Snapshot, Observation, Action>,
  rawAction: unknown,
): Promise<TaskStepResult<Snapshot, Observation, Action>> {
  if (environment.sideEffect !== "none") return failure("controlled_commit_required");
  const before = await beforeStep(environment, rawAction);
  if ("error" in before) return { ok: false, error: before.error };
  const prediction = environment.predict(before.snapshot, before.action);
  const observed = parse(environment.observationSchema, await environment.act(before.action));
  if (!observed) return failure("malformed_observation");
  const after = parse(environment.snapshotSchema, environment.snapshot());
  if (!after) return failure("malformed_snapshot");
  const verification = await environment.verify(after, observed);
  return {
    ok: true,
    transition: { action: before.action, before, prediction, observed, after, terminal: environment.terminal(after), verification },
  };
}

export async function replayFixture<Snapshot, Observation, Action>(
  environment: TaskEnvironment<Snapshot, Observation, Action>,
  actions: unknown[],
): Promise<ReplayResult<Snapshot, Observation, Action>> {
  const transitions: TaskTransition<Snapshot, Observation, Action>[] = [];
  for (const action of actions) {
    const result = await runTaskStep(environment, action);
    if (!result.ok) return { ok: false, transitions, error: result.error };
    transitions.push(result.transition);
  }
  return { ok: true, transitions };
}
