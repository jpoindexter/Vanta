import { describe, it, expect } from "vitest";
import {
  runInWorkerContext,
  currentWorkerContext,
  currentWorkerId,
  isInWorkerContext,
  withWorkerOverride,
  type WorkerContext,
} from "./worker-context.js";

const ctx = (workerId: string, extra: Partial<WorkerContext> = {}): WorkerContext => ({ workerId, ...extra });

/** Yield control to the event loop, then resolve — forces an `await` boundary so
 *  concurrent contexts must survive an interleave to stay correct. */
const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe("runInWorkerContext + readers", () => {
  it("sets the context fn reads via currentWorkerContext/currentWorkerId", async () => {
    const seen = await runInWorkerContext(ctx("w1", { goal: "ship it", dataDir: "/d", scopeRoot: "/root" }), async () => ({
      context: currentWorkerContext(),
      id: currentWorkerId(),
      inside: isInWorkerContext(),
    }));
    expect(seen.context).toEqual({ workerId: "w1", goal: "ship it", dataDir: "/d", scopeRoot: "/root" });
    expect(seen.id).toBe("w1");
    expect(seen.inside).toBe(true);
  });

  it("returns fn's resolved value verbatim", async () => {
    const value = await runInWorkerContext(ctx("w1"), async () => 42);
    expect(value).toBe(42);
  });

  it("reads the context across await boundaries inside fn", async () => {
    const id = await runInWorkerContext(ctx("deep"), async () => {
      await tick();
      await tick();
      return currentWorkerId();
    });
    expect(id).toBe("deep");
  });
});

describe("outside any worker context", () => {
  it("currentWorkerContext/currentWorkerId are undefined and isInWorkerContext is false", () => {
    expect(currentWorkerContext()).toBeUndefined();
    expect(currentWorkerId()).toBeUndefined();
    expect(isInWorkerContext()).toBe(false);
  });

  it("the context is gone again after a run completes", async () => {
    await runInWorkerContext(ctx("transient"), async () => {
      expect(currentWorkerId()).toBe("transient");
    });
    expect(currentWorkerId()).toBeUndefined();
    expect(isInWorkerContext()).toBe(false);
  });
});

describe("concurrent isolation (no bleed)", () => {
  it("two interleaved runs each read THEIR OWN id throughout", async () => {
    // Each worker awaits real (interleaved) async work between reads. If the ALS
    // store leaked across the event-loop interleave, a worker would observe the
    // other's id at some checkpoint. We assert every read stays its own id.
    const worker = async (id: string, delays: number[]): Promise<string[]> =>
      runInWorkerContext(ctx(id), async () => {
        const reads: string[] = [];
        for (const d of delays) {
          await tick(d);
          reads.push(currentWorkerId() ?? "NONE");
        }
        return reads;
      });

    // Stagger the delays so the two runs interleave on the event loop.
    const [a, b] = await Promise.all([
      worker("alpha", [3, 1, 4, 1, 5]),
      worker("beta", [2, 7, 1, 8, 2]),
    ]);

    expect(a).toEqual(["alpha", "alpha", "alpha", "alpha", "alpha"]);
    expect(b).toEqual(["beta", "beta", "beta", "beta", "beta"]);
  });

  it("keeps full context (goal/dataDir) isolated across concurrent runs", async () => {
    const worker = async (id: string): Promise<WorkerContext | undefined> =>
      runInWorkerContext(ctx(id, { goal: `goal-${id}`, dataDir: `/data/${id}` }), async () => {
        await tick(id === "x" ? 5 : 1);
        const mid = currentWorkerContext();
        await tick(id === "x" ? 1 : 5);
        const end = currentWorkerContext();
        // Both reads inside one run must be the same worker's context.
        expect(mid).toEqual(end);
        return end;
      });

    const [x, y] = await Promise.all([worker("x"), worker("y")]);
    expect(x).toEqual({ workerId: "x", goal: "goal-x", dataDir: "/data/x" });
    expect(y).toEqual({ workerId: "y", goal: "goal-y", dataDir: "/data/y" });
  });

  it("many concurrent runs all stay independent", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `w${i}`);
    const results = await Promise.all(
      ids.map((id) =>
        runInWorkerContext(ctx(id), async () => {
          await tick((Number(id.slice(1)) % 4) + 1);
          return currentWorkerId();
        }),
      ),
    );
    expect(results).toEqual(ids);
  });
});

describe("errors-as-values unwind", () => {
  it("propagates fn's throw and still unwinds the context", async () => {
    await expect(
      runInWorkerContext(ctx("boom"), async () => {
        await tick();
        throw new Error("worker failed");
      }),
    ).rejects.toThrow("worker failed");
    // The context unwound despite the throw.
    expect(currentWorkerId()).toBeUndefined();
    expect(isInWorkerContext()).toBe(false);
  });

  it("a failing worker does not corrupt a concurrent healthy worker", async () => {
    const healthy = runInWorkerContext(ctx("ok"), async () => {
      await tick(4);
      return currentWorkerId();
    });
    const failing = runInWorkerContext(ctx("bad"), async () => {
      await tick(1);
      throw new Error("nope");
    });
    const [okResult, badResult] = await Promise.allSettled([healthy, failing]);
    expect(okResult).toEqual({ status: "fulfilled", value: "ok" });
    expect(badResult.status).toBe("rejected");
  });
});

describe("withWorkerOverride", () => {
  it("merges current + partial for nested scoping", async () => {
    const merged = await runInWorkerContext(ctx("w1", { goal: "outer", scopeRoot: "/root" }), () =>
      withWorkerOverride({ scopeRoot: "/root/sub", dataDir: "/d" }, async () => currentWorkerContext()),
    );
    // workerId + goal inherited from the outer context; scopeRoot overridden; dataDir added.
    expect(merged).toEqual({ workerId: "w1", goal: "outer", scopeRoot: "/root/sub", dataDir: "/d" });
  });

  it("partial keys override the current context's keys", async () => {
    const id = await runInWorkerContext(ctx("outer"), () =>
      withWorkerOverride({ workerId: "inner" }, async () => currentWorkerId()),
    );
    expect(id).toBe("inner");
  });

  it("restores the outer context when the nested override exits", async () => {
    const outerAfter = await runInWorkerContext(ctx("outer", { goal: "keep" }), async () => {
      await withWorkerOverride({ workerId: "inner", goal: "nested" }, async () => {
        expect(currentWorkerId()).toBe("inner");
        expect(currentWorkerContext()?.goal).toBe("nested");
      });
      // Back in the outer context.
      return currentWorkerContext();
    });
    expect(outerAfter).toEqual({ workerId: "outer", goal: "keep" });
  });

  it("outside any context, a partial without workerId yields an empty id (safe no-throw)", async () => {
    const id = await withWorkerOverride({ goal: "orphan" }, async () => currentWorkerId());
    expect(id).toBe("");
    // And the context is gone again afterward.
    expect(isInWorkerContext()).toBe(false);
  });
});
