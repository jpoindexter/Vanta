import { describe, expect, it } from "vitest";
import { createRuntimeRegistry } from "./registry.js";
import type { RunInput, RunOutput, WorkerRuntime } from "./types.js";

const input = (signal = new AbortController().signal): RunInput =>
  ({ ticket: { id: "T-1", title: "t", workerId: "w", role: "r", runId: "r1" }, instruction: "go", cwd: "/work", signal, onEvent: () => {} });

const ok: RunOutput = { status: "completed", summary: "done", workProducts: [] };

function runtime(id: string, run: WorkerRuntime["run"], extra: Partial<WorkerRuntime> = {}): WorkerRuntime {
  return { id, displayName: id, selfApproving: false, detect: async () => ({ runtimeId: id, installed: true, command: id, version: "1.0.0", auth: "unknown", selfApproving: false }), run, ...extra };
}

describe("runtime registry", () => {
  it("registers, lists and looks up runtimes", () => {
    const registry = createRuntimeRegistry([runtime("a", async () => ok)]);
    registry.register(runtime("b", async () => ok));
    expect(registry.list().map((r) => r.id)).toEqual(["a", "b"]);
    expect(registry.get("b")?.id).toBe("b");
    expect(registry.get("zzz")).toBeUndefined();
  });

  it("returns the validated output of a healthy runtime", async () => {
    const registry = createRuntimeRegistry([runtime("a", async () => ok)]);
    expect(await registry.run("a", input())).toEqual(ok);
  });

  it("refuses an unknown runtime and names the registered ones", async () => {
    const out = await createRuntimeRegistry([runtime("a", async () => ok)]).run("nope", input());
    expect(out).toMatchObject({ status: "refused" });
    expect(out.error).toContain("Registered: a");
  });

  it("turns a throw into a failed output", async () => {
    const out = await createRuntimeRegistry([runtime("a", async () => { throw new Error("boom"); })]).run("a", input());
    expect(out).toMatchObject({ status: "failed", error: "boom" });
  });

  it("rejects a malformed result instead of passing it on", async () => {
    const bad = runtime("a", async () => ({ status: "weird", summary: 1 }) as unknown as RunOutput);
    expect((await createRuntimeRegistry([bad]).run("a", input())).status).toBe("failed");
  });

  it("does not start a run whose signal is already aborted", async () => {
    let started = false;
    const controller = new AbortController();
    controller.abort();
    const out = await createRuntimeRegistry([runtime("a", async () => { started = true; return ok; })]).run("a", input(controller.signal));
    expect(started).toBe(false);
    expect(out.status).toBe("aborted");
  });

  it("refuses to resume a runtime that cannot", async () => {
    const out = await createRuntimeRegistry([runtime("a", async () => ok)]).resume("a", { ...input(), sessionRef: { runtimeId: "a", sessionId: "s", cwd: "/work" } });
    expect(out.status).toBe("refused");
  });

  it("detects every runtime and survives a detect that throws", async () => {
    const registry = createRuntimeRegistry([
      runtime("a", async () => ok),
      runtime("b", async () => ok, { detect: async () => { throw new Error("probe died"); } }),
    ]);
    const results = await registry.detectAll({ env: {} });
    expect(results.map((r) => [r.runtimeId, r.installed])).toEqual([["a", true], ["b", false]]);
    expect(results[1]!.reason).toBe("probe died");
  });
});
