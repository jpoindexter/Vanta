import { describe, it, expect } from "vitest";
import { HANDLERS } from "./handlers.js";
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
