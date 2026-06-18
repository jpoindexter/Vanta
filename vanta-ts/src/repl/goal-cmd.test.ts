import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { goal } from "./goal-cmd.js";
import type { ReplCtx } from "./types.js";
import type { Goal } from "../types.js";

describe("/goal dependencies", () => {
  it("links goals with blocks syntax and shows blocked graph state", async () => {
    const ctx = ctxWithGoals(goals("active", "active"));
    expect((await goal("blocks 1 2", ctx)).output).toContain("#1 blocks #2");
    const status = await goal("status", ctx);
    expect(status.output).toContain("◌ two");
    expect(status.output).toContain("blocked_by:1");
  });

  it("wakes a dependent when its blocker is completed", async () => {
    const all = goals("active", "active");
    const ctx = ctxWithGoals(all);
    await goal("blocks 1 2", ctx);
    const result = await goal("done 1", ctx);
    expect(result.output).toContain("completed goal 1");
    expect(result.output).toContain("woke: #2 two");
  });
});

function goals(a: Goal["status"], b: Goal["status"]): Goal[] {
  return [
    { id: 1, text: "one", status: a },
    { id: 2, text: "two", status: b },
  ];
}

function ctxWithGoals(goalsRef: Goal[]): ReplCtx {
  return {
    convo: { messages: [{ role: "system", content: "sys" }], send: async () => ({ finalText: "", iterations: 0, stoppedReason: "done", toolIterations: 0 }), setProvider: () => {}, setSessionMemory: () => {} },
    setup: ({
      safety: {
        getGoals: async () => goalsRef,
        completeGoal: async (id: number) => {
          const goalRef = goalsRef.find((g) => g.id === id);
          if (goalRef) goalRef.status = "done";
          return !!goalRef;
        },
        addGoal: async () => true,
      },
    } as unknown) as ReplCtx["setup"],
    dataDir: mkdtempSync(join(tmpdir(), "goal-cmd-")),
    state: { sessionId: "s", started: "", turnIndex: 0 },
    env: {},
    now: () => new Date("2026-06-18T00:00:00Z"),
  };
}
