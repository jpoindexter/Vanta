import { describe, expect, it } from "vitest";
import type { WorkerRunRequest, WorkerRuntime as EnginePort } from "../desktop/company-ports.js";
import { createNativeWorkerRuntime } from "./native.js";
import { resultFor, toEnginePort } from "./port-bridge.js";
import type { RunInput, RunOutput, WorkerRuntime } from "./types.js";

const request = (patch: Partial<WorkerRunRequest> = {}): WorkerRunRequest => ({
  worker: { kind: "worker", id: "dev", role: "Engineer", status: "idle", ts: "2026-10-13T10:00:00.000Z", adapter: "cli:claude-code", model: "sonnet" },
  task: { kind: "task", id: "T-1", workerId: "dev", title: "Write notes", status: "running", created: "2026-10-13T10:00:00.000Z", updated: "2026-10-13T10:00:00.000Z" },
  instruction: "do the thing",
  env: {},
  signal: new AbortController().signal,
  progress: () => {},
  cwd: "/work/app",
  runId: "run-9",
  ...patch,
});

function fakeRuntime(output: RunOutput, seen: RunInput[] = []): WorkerRuntime {
  return { id: "claude-code", displayName: "Claude Code", selfApproving: false, detect: async () => { throw new Error("unused"); }, run: async (input) => { seen.push(input); return output; } };
}

describe("resultFor", () => {
  it("maps a completed run: products, reported cost and tokens", () => {
    const result = resultFor({ status: "completed", summary: "done", workProducts: [{ kind: "report", source: "final-message", content: "# Done", files: [] }, { kind: "code", source: "git-diff", content: "Changed 1 file", files: ["a.ts"] }], usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.02 }, model: "claude-sonnet" }, "claude-code");
    expect(result).toEqual({ ok: true, summary: "done", artifacts: [{ artifact: "# Done", kind: "report" }, { artifact: "Changed 1 file", kind: "code" }], usage: { inputTokens: 10, outputTokens: 5 }, cost: { usd: 0.02, basis: "reported" }, provider: "claude-code", model: "claude-sonnet" });
  });

  it("leaves cost and tokens out when the CLI did not report them", () => {
    const result = resultFor({ status: "completed", summary: "done", workProducts: [], usage: { inputTokens: 10, costUsd: null } }, "codex");
    expect(result).not.toHaveProperty("cost");
    expect(result).not.toHaveProperty("usage");
  });

  it("keeps a reported zero cost distinct from not reported", () => {
    expect(resultFor({ status: "completed", summary: "x", workProducts: [], usage: { costUsd: 0 } }, "claude-code")).toMatchObject({ cost: { usd: 0, basis: "reported" } });
  });

  it("maps every non-completed status to a failure with the error text", () => {
    for (const status of ["failed", "aborted", "refused"] as const) {
      expect(resultFor({ status, summary: "s", error: "why", workProducts: [] }, "x")).toEqual({ ok: false, error: "why" });
    }
  });
});

describe("toEnginePort", () => {
  it("passes the ticket, instruction, cwd, budget and signal to the runtime and relays events as progress", async () => {
    const seen: RunInput[] = [];
    const progress: string[] = [];
    const events: string[] = [];
    const port = toEnginePort(fakeRuntime({ status: "completed", summary: "ok", workProducts: [] }, seen));
    const req = request({ progress: (n) => progress.push(n), onEvent: (e) => events.push(e.text), maxBudgetUsd: 2 });
    expect(await port.run(req)).toMatchObject({ ok: true });
    expect(port.id).toBe("claude-code");
    expect(seen[0]).toMatchObject({ ticket: { id: "T-1", title: "Write notes", workerId: "dev", role: "Engineer", runId: "run-9", adapter: "cli:claude-code", model: "sonnet" }, instruction: "do the thing", cwd: "/work/app", maxBudgetUsd: 2 });
    seen[0]!.onEvent({ kind: "tool", text: "Read(a.ts)" });
    expect(progress).toEqual(["Read(a.ts)"]);
    expect(events).toEqual(["Read(a.ts)"]);
  });

  it("refuses to run without a working directory", async () => {
    const out = await toEnginePort(fakeRuntime({ status: "completed", summary: "ok", workProducts: [] })).run(request({ cwd: undefined }));
    expect(out).toMatchObject({ ok: false });
  });
});

describe("native runtime wrapper", () => {
  it("runs the engine port with a worker and task built from the ticket", async () => {
    let seen: WorkerRunRequest | undefined;
    const port: EnginePort = { id: "vanta-native", run: async (r) => { seen = r; return { ok: true, summary: "native done", artifacts: [{ artifact: "text", kind: "report" }], usage: { inputTokens: 3, outputTokens: 4 }, cost: { usd: 0.01, basis: "estimated" }, model: "gpt-x" }; } };
    const runtime = createNativeWorkerRuntime({ port: async () => port, env: { X: "1" } });
    const out = await runtime.run({ ticket: { id: "T-2", title: "Native job", workerId: "dev", role: "Engineer", runId: "r2", adapter: "openai", model: "gpt-x" }, instruction: "go", cwd: "/work", signal: new AbortController().signal, onEvent: () => {} });
    expect(seen).toMatchObject({ worker: { id: "dev", adapter: "openai", model: "gpt-x" }, task: { id: "T-2", title: "Native job", status: "running" }, instruction: "go", env: { X: "1" }, cwd: "/work", runId: "r2" });
    expect(out).toMatchObject({ status: "completed", summary: "native done", usage: { inputTokens: 3, outputTokens: 4, costUsd: 0.01 }, model: "gpt-x" });
    expect(runtime.id).toBe("vanta-native");
  });

  it("maps a native failure to a failed output", async () => {
    const runtime = createNativeWorkerRuntime({ port: async () => ({ id: "vanta-native", run: async () => ({ ok: false, error: "provider down" }) }), env: {} });
    expect(await runtime.run({ ticket: { id: "T", title: "t", workerId: "w", role: "r", runId: "r" }, instruction: "x", cwd: "/", signal: new AbortController().signal, onEvent: () => {} })).toMatchObject({ status: "failed", error: "provider down" });
  });
});
