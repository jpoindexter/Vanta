import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { runBacktest, type BacktestReport } from "./backtest.js";
import { commitActions, MemoryIdempotencyClaims, type ControlledEnvironment, type KernelCommitRequest } from "./controlled-commit.js";
import type { GroundedState } from "./grounding.js";
import type { ModelSandboxReceipt } from "./model-sandbox.js";
import type { TaskModelArtifact } from "./task-model.js";
import { runTaskStep, type TaskEnvironment } from "./task-environment.js";
import { TaskTransitionTimeline, type TaskTimelineRecord, type TaskTransitionRecord } from "./timeline.js";

const canRunSeatbelt = process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec");
const ActionSchema = z.object({ type: z.literal("advance") });
const ObservationSchema = z.object({ steps: z.number().int().nonnegative() });
type Action = z.infer<typeof ActionSchema>;
type Observation = z.infer<typeof ObservationSchema>;
const source = `({
  step(input) {
    const steps = input.state.counters.steps;
    return { ...input.state, counters: { ...input.state.counters, steps: { ...steps, value: steps.value + 1 } } };
  },
  isGoal(state) { return state.counters.steps.value >= 2; }
})`;

function state(steps: number): GroundedState {
  const provenance = [{ runId: "run-commit", transitionSequence: 1, adapterId: "fixture", source: "fixture" }];
  return {
    schemaVersion: 1,
    representationVersion: 1,
    source: { runId: "run-commit", transitionSequence: 1, adapterId: "fixture" },
    entities: [],
    counters: { steps: { value: steps, confidence: 1, provenance, superseded: [] } },
    supersededEntities: [],
    revisions: [],
  };
}

function artifact(): TaskModelArtifact {
  return {
    manifest: {
      schemaVersion: 1,
      taskId: "commit-fixture",
      modelVersion: 1,
      representationVersion: 1,
      createdAt: "2026-07-17T00:00:00.000Z",
      sourceHash: createHash("sha256").update(source).digest("hex"),
      sourceTransitions: [{ runId: "run-commit", sequence: 1 }],
    },
    source,
    generatedTypes: "fixture",
  };
}

function historicalTransition(): TaskTransitionRecord {
  return {
    kind: "task_transition", version: 1, runId: "run-commit", sequence: 1, status: "observed",
    adapterId: "fixture", taskEnvironmentVersion: "1",
    model: { provider: "schema", id: "commit-fixture", version: "1" },
    approval: { mode: "test", resolution: "approved" },
    correlation: { sessionId: "session", turnId: "turn-1", actionId: "action-1" },
    before: { snapshot: state(0), observation: { steps: 0 } },
    action: { type: "advance" }, prediction: { summary: "advance" }, observed: { steps: 1 }, after: state(1),
    verification: { ok: true, summary: "matched" },
  };
}

function receiptSink() {
  const receipts: ModelSandboxReceipt[] = [];
  return { receipts, recordReceipt: async (receipt: ModelSandboxReceipt) => { receipts.push(receipt); } };
}

async function certification(history: readonly TaskTimelineRecord[]): Promise<BacktestReport> {
  return runBacktest({ artifact: artifact(), timeline: history, recordReceipt: receiptSink().recordReceipt });
}

function harness(initial = state(1)) {
  let current = initial;
  const logEvent = vi.fn<(event: string) => Promise<void>>(async () => {});
  const history = [historicalTransition()];
  const prior = `${JSON.stringify({ ts: 1, event: JSON.stringify(history[0]), h: "fixture-chain" })}\n`;
  const environment: ControlledEnvironment<Observation, Action> = {
    id: "controlled-fixture",
    sideEffect: "reversible",
    observationSchema: ObservationSchema,
    legalActions: ActionSchema,
    snapshot: () => structuredClone(current),
    observe: () => ({ steps: current.counters.steps?.value }),
    terminal: (next) => Number(next.counters.steps?.value) >= 2 ? "goal" : undefined,
    verify: (next, observed) => ({ ok: next.counters.steps?.value === observed.steps, summary: "state matches observation" }),
  };
  const kernel = {
    execute: vi.fn(async (request: KernelCommitRequest<Action>) => {
      current = structuredClone(request.expectedTransition.state);
      return { steps: current.counters.steps?.value };
    }),
  };
  return {
    environment,
    kernel,
    history,
    timeline: new TaskTransitionTimeline("run-commit", prior, { logEvent }),
    logEvent,
    setCurrent: (next: GroundedState) => { current = structuredClone(next); },
  };
}

describe.skipIf(!canRunSeatbelt)("Schema controlled commit gate", () => {
  it("routes an approved legal action through the kernel with the complete control contract", async () => {
    const fixture = harness();
    const authorize = vi.fn(async () => ({ approved: true, mode: "ask", resolution: "approved" }));
    const result = await commitActions({
      artifact: artifact(), certification: await certification(fixture.history), history: fixture.history,
      actions: [{ action: { type: "advance" }, risk: "medium", reason: "finish fixture" }],
      environment: fixture.environment, timeline: fixture.timeline, sessionId: "session", turnId: "turn-2",
      claims: new MemoryIdempotencyClaims(), authorize, kernel: fixture.kernel, recordReceipt: receiptSink().recordReceipt,
    });

    expect(result).toMatchObject({ ok: true, records: [{ sequence: 2, status: "terminal", approval: { resolution: "approved" } }] });
    expect(authorize).toHaveBeenCalledOnce();
    expect(fixture.kernel.execute).toHaveBeenCalledOnce();
    const request = fixture.kernel.execute.mock.calls[0]![0];
    expect(request).toMatchObject({
      environmentId: "controlled-fixture", modelVersion: 1,
      expectedTransition: { state: { counters: { steps: { value: 2 } } }, goal: true },
      approval: { approved: true }, risk: "medium",
    });
    expect(request.idempotencyKey).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(fixture.logEvent.mock.calls[0]![0])).toMatchObject({
      prediction: { expectedState: { counters: { steps: { value: 2 } } }, modelVersion: 1, risk: "medium" },
      observed: { steps: 2 },
    });
  });

  it("claims idempotency before the kernel and refuses duplicate execution", async () => {
    const fixture = harness();
    const report = await certification(fixture.history);
    const common = {
      artifact: artifact(), certification: report, history: fixture.history,
      actions: [{ action: { type: "advance" }, risk: "low" as const, reason: "fixture" }],
      environment: fixture.environment, timeline: fixture.timeline, sessionId: "session", turnId: "turn-2",
      claims: new MemoryIdempotencyClaims(), authorize: async () => ({ approved: true, mode: "auto", resolution: "approved" }),
      kernel: fixture.kernel, recordReceipt: receiptSink().recordReceipt,
    };
    expect((await commitActions(common)).ok).toBe(true);
    expect(await commitActions(common)).toMatchObject({ ok: false, error: { code: "duplicate_action" } });
    expect(fixture.kernel.execute).toHaveBeenCalledOnce();
  });

  it("stops a multi-action batch on the first prediction mismatch", async () => {
    const fixture = harness();
    const divergentKernel = {
      execute: vi.fn(async (request: KernelCommitRequest<Action>) => {
        const wrong = structuredClone(request.expectedTransition.state);
        wrong.counters.steps!.value = Number(wrong.counters.steps!.value) + 4;
        fixture.setCurrent(wrong);
        return { steps: wrong.counters.steps!.value };
      }),
    };
    const result = await commitActions({
      artifact: artifact(), certification: await certification(fixture.history), history: fixture.history,
      actions: [
        { action: { type: "advance" }, risk: "low", reason: "first" },
        { action: { type: "advance" }, risk: "low", reason: "must not run" },
      ],
      environment: fixture.environment, timeline: fixture.timeline, sessionId: "session", turnId: "turn",
      claims: new MemoryIdempotencyClaims(), authorize: async () => ({ approved: true, mode: "auto", resolution: "approved" }),
      kernel: divergentKernel, recordReceipt: receiptSink().recordReceipt,
    });
    expect(result).toMatchObject({
      ok: false,
      records: [{ sequence: 2 }],
      error: { code: "prediction_mismatch", counterexample: { sequence: 2, path: "$.counters.steps.value", predicted: 2, observed: 6 } },
    });
    expect(divergentKernel.execute).toHaveBeenCalledOnce();
  });

  it("fails before approval or kernel execution for illegal actions", async () => {
    const fixture = harness();
    const authorize = vi.fn(async () => ({ approved: true, mode: "ask", resolution: "approved" }));
    const result = await commitActions({
      artifact: artifact(), certification: await certification(fixture.history), history: fixture.history,
      actions: [{ action: { type: "delete" }, risk: "high", reason: "invalid" }],
      environment: fixture.environment, timeline: fixture.timeline, sessionId: "session", turnId: "turn",
      claims: new MemoryIdempotencyClaims(), authorize, kernel: fixture.kernel, recordReceipt: receiptSink().recordReceipt,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_action" } });
    expect(authorize).not.toHaveBeenCalled();
    expect(fixture.kernel.execute).not.toHaveBeenCalled();
  });

  it("refuses denied approval, forged certification, and stale history", async () => {
    const fixture = harness();
    const valid = await certification(fixture.history);
    const base = {
      artifact: artifact(), history: fixture.history,
      actions: [{ action: { type: "advance" }, risk: "high" as const, reason: "fixture" }],
      environment: fixture.environment, timeline: fixture.timeline, sessionId: "session", turnId: "turn",
      claims: new MemoryIdempotencyClaims(), kernel: fixture.kernel, recordReceipt: receiptSink().recordReceipt,
    };
    expect(await commitActions({ ...base, certification: valid, authorize: async () => ({ approved: false, mode: "ask", resolution: "denied" }) }))
      .toMatchObject({ ok: false, error: { code: "approval_denied" } });
    expect(await commitActions({ ...base, certification: { ...valid }, authorize: async () => ({ approved: true, mode: "ask", resolution: "approved" }) }))
      .toMatchObject({ ok: false, error: { code: "uncertified_model" } });
    const staleHistory = [...fixture.history, { ...historicalTransition(), sequence: 2 }];
    expect(await commitActions({ ...base, history: staleHistory, certification: valid, authorize: async () => ({ approved: true, mode: "ask", resolution: "approved" }) }))
      .toMatchObject({ ok: false, error: { code: "stale_certification" } });
    expect(fixture.kernel.execute).not.toHaveBeenCalled();
  });
});

describe("Schema side-effect bypass", () => {
  it("refuses reversible or external act callbacks outside commitActions", async () => {
    const act = vi.fn(() => ({ ready: true }));
    const environment: TaskEnvironment<{ ready: boolean }, { ready: boolean }, { type: "act" }> = {
      version: "1", id: "bypass-fixture", sideEffect: "external",
      snapshotSchema: z.object({ ready: z.boolean() }), observationSchema: z.object({ ready: z.boolean() }),
      legalActions: z.object({ type: z.literal("act") }), snapshot: () => ({ ready: true }), observe: () => ({ ready: true }),
      predict: () => ({ summary: "act" }), act, terminal: () => undefined,
      verify: () => ({ ok: true, summary: "verified" }),
    };
    expect(await runTaskStep(environment, { type: "act" })).toEqual({
      ok: false, error: { code: "controlled_commit_required", message: "controlled commit required" },
    });
    expect(act).not.toHaveBeenCalled();
  });
});
