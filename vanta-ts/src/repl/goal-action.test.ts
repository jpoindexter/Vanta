import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HANDLERS } from "./handlers.js";
import { writeRalphState, readRalphState } from "../ralph/state.js";
import type { ReplCtx } from "./types.js";

function makeCtx(env: NodeJS.ProcessEnv): ReplCtx {
  const added: string[] = [];
  return {
    setup: {
      safety: {
        addGoal: async (t: string) => { added.push(t); return true; },
        getGoals: async () => added.map((text, i) => ({ id: i + 1, text, status: "active" })),
      },
    } as unknown as ReplCtx["setup"],
    convo: { messages: [{ role: "system", content: "sys" }] } as unknown as ReplCtx["convo"],
    dataDir: "/tmp/nonexistent/.vanta",
    env,
  } as unknown as ReplCtx;
}

describe("GOAL-ACTION auto-fire in /goal", () => {
  it("auto-fires a concrete-next-step resend when a vague goal is set", async () => {
    const r = await HANDLERS.goal!("improve everything", makeCtx({}));
    expect(r.output).toContain("goal set");
    expect(r.resend).toBeDefined();
    expect(r.resend).toMatch(/next micro-step|immediately actionable/i);
  });

  it("does NOT auto-fire for a concrete goal", async () => {
    const r = await HANDLERS.goal!("fix repl/handlers.ts line 83 model bug", makeCtx({}));
    expect(r.output).toContain("goal set");
    expect(r.resend).toBeUndefined();
  });

  it("respects the VANTA_GOAL_ACTION=0 opt-out", async () => {
    const r = await HANDLERS.goal!("improve everything", makeCtx({ VANTA_GOAL_ACTION: "0" }));
    expect(r.resend).toBeUndefined();
  });
});

describe("/goal resume + drop", () => {
  function ctxFor(goals: { id: number; text: string; status: string }[], completed: number[]): ReplCtx {
    return {
      setup: { safety: {
        getGoals: async () => goals,
        completeGoal: async (id: number) => { completed.push(id); return true; },
      } } as unknown as ReplCtx["setup"],
      convo: { messages: [{ role: "system", content: "sys" }] } as unknown as ReplCtx["convo"],
      dataDir: "/tmp/x/.vanta", env: {},
    } as unknown as ReplCtx;
  }

  it("resume re-injects the carried goal into the live system prompt", async () => {
    const ctx = ctxFor([{ id: 1, text: "Add NVIDIA NIM", status: "active" }], []);
    const r = await HANDLERS.goal!("resume", ctx);
    expect(r.output).toContain("resumed goal: Add NVIDIA NIM");
    expect((ctx.convo.messages[0] as { content: string }).content).toContain("Resumed standing goal");
  });

  it("resume with no carried goal is a no-op message", async () => {
    const r = await HANDLERS.goal!("resume", ctxFor([], []));
    expect(r.output).toContain("no carried goal");
  });

  it("drop completes all active goals (alias of clear)", async () => {
    const completed: number[] = [];
    const r = await HANDLERS.goal!("drop", ctxFor([{ id: 1, text: "X", status: "active" }, { id: 2, text: "Y", status: "active" }], completed));
    expect(r.output).toContain("dropped 2");
    expect(completed).toEqual([1, 2]);
  });

  it("resume activates Ralph continuity when no carried kernel goal exists", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "vanta-ralph-goal-"));
    try {
      await writeRalphState(dataDir, {
        goal: "Ship Ralph loop",
        features: [{ id: "prompt", title: "Paused prompt injection", status: "pending" }],
        nextAction: "Update prompt.ts",
        relevantFiles: ["src/prompt.ts"],
        updatedAt: "2026-06-15T10:00:00.000Z",
      });
      const ctx = { ...ctxFor([], []), dataDir };
      const r = await HANDLERS.goal!("resume", ctx);
      expect(r.output).toContain("resumed Ralph loop");
      expect((ctx.convo.messages[0] as { content: string }).content).toContain("Resumed Ralph loop");
      expect((ctx.convo.messages[0] as { content: string }).content).toContain("Paused prompt injection");
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("drop marks incomplete Ralph features dropped", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "vanta-ralph-drop-"));
    try {
      await writeRalphState(dataDir, {
        goal: "Ship Ralph loop",
        features: [
          { id: "a", title: "Done item", status: "done" },
          { id: "b", title: "Pending item", status: "pending" },
        ],
        updatedAt: "2026-06-15T10:00:00.000Z",
      });
      const r = await HANDLERS.goal!("drop", { ...ctxFor([], []), dataDir });
      expect(r.output).toContain("dropped Ralph loop");
      const state = await readRalphState(dataDir);
      expect(state?.features.map((f) => f.status)).toEqual(["done", "dropped"]);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
