import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { goal } from "./goal-cmd.js";
import { appendVelocityEvent, readVelocityEvents } from "../velocity/store.js";
import { loadSentinels } from "../goals/sentinel.js";
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

  it("creates a standing sentinel when completing a goal with --check", async () => {
    const ctx = ctxWithGoals(goals("active", "active"));
    const result = await goal("done 1 --check true", ctx);
    expect(result.output).toContain("watching: goal-1");
    expect((await loadSentinels(ctx.dataDir)).sentinels[0]).toMatchObject({ goalId: 1, command: "true" });
  });
});

describe("/goal velocity closure (ND-VELOCITY-CLOSURE)", () => {
  const homes: string[] = [];
  afterEach(() => {
    for (const h of homes.splice(0)) rmSync(h, { recursive: true, force: true });
  });

  function ctxWithVelocityHome(): ReplCtx {
    const home = mkdtempSync(join(tmpdir(), "goal-velocity-"));
    homes.push(home);
    const ctx = ctxWithGoals([]);
    // GOAL-ACTION off so a vague new goal doesn't try to build a next-step resend.
    ctx.env = { VANTA_HOME: home, VANTA_GOAL_ACTION: "0" };
    return ctx;
  }

  it("records a newly-set goal as a capture event (cross-session store)", async () => {
    const ctx = ctxWithVelocityHome();
    await goal("ship the thing", ctx);
    const events = await readVelocityEvents(ctx.env);
    expect(events).toEqual([
      expect.objectContaining({ type: "capture", itemId: "ship the thing" }),
    ]);
  });

  it("does not double-count when the same goal is re-set", async () => {
    const ctx = ctxWithVelocityHome();
    await goal("same goal", ctx);
    await goal("same goal", ctx);
    const captures = (await readVelocityEvents(ctx.env)).filter((e) => e.type === "capture");
    expect(captures).toHaveLength(1);
  });

  it("surfaces the ratio + top unfinished when capture:ship exceeds 5:1", async () => {
    const ctx = ctxWithVelocityHome();
    // Seed 5 prior captures + 0 ships; the new goal makes it 6 captures, 0 ships.
    for (let i = 0; i < 5; i++) {
      await appendVelocityEvent(ctx.env, { type: "capture", itemId: `prior-${i}`, at: "2026-06-01T00:00:00Z" });
    }
    const res = await goal("the newest goal", ctx);
    expect(res.output).toContain("goal set: the newest goal");
    expect(res.output).toContain("6.0:1");
    expect(res.output).toContain("top unfinished:");
    expect(res.output).toContain("· the newest goal");
  });

  it("stays silent when the ratio is at or under 5:1", async () => {
    const ctx = ctxWithVelocityHome();
    // 4 prior captures + 1 ship; new goal → 5 captures / 1 ship = 5.0, not > 5.
    for (let i = 0; i < 4; i++) {
      await appendVelocityEvent(ctx.env, { type: "capture", itemId: `prior-${i}`, at: "2026-06-01T00:00:00Z" });
    }
    await appendVelocityEvent(ctx.env, { type: "ship", itemId: "prior-0", at: "2026-06-02T00:00:00Z" });
    const res = await goal("under threshold goal", ctx);
    expect(res.output).toContain("goal set: under threshold goal");
    expect(res.output).not.toContain("capture:ship");
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
