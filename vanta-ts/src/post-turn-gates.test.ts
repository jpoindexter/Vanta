import { describe, it, expect } from "vitest";
import { runPostTurnGates, freshGateState } from "./repl/post-turn-gates.js";
import type { Message } from "./types.js";
import type { SafetyClient } from "./safety-client.js";

const safety = { getGoals: async () => [] } as unknown as SafetyClient;
const msgs: Message[] = [{ role: "user", content: "hi" }, { role: "assistant", content: "ok" }];
const GATES = ["inhibit", "nd", "research", "scopeDelta", "setShift", "stall", "wmManip"];

describe("freshGateState", () => {
  it("initializes all gate states", () => {
    const g = freshGateState();
    expect(Object.keys(g).sort()).toEqual(GATES);
    expect(g.stall).toEqual({ stalledTurns: 0 });
    expect(g.inhibit).toEqual({ consecutiveCalls: 0 });
    expect(g.nd).toBeDefined();
  });
});

describe("runPostTurnGates", () => {
  it("returns a complete new bundle and emits no notes when every gate is disabled", async () => {
    const env: NodeJS.ProcessEnv = {
      VANTA_INHIBIT_THRESHOLD: "0", VANTA_SETSHIFT_THRESHOLD: "0", VANTA_STALL_THRESHOLD: "0",
      VANTA_SCOPE_DELTA_THRESHOLD: "0", VANTA_WM_MANIP_THRESHOLD: "0", VANTA_RESEARCH_GATE_TURNS: "0",
      VANTA_ND: "off",
    };
    const notes: string[] = [];
    const out = await runPostTurnGates(freshGateState(), { messages: msgs, safety, dataDir: "/tmp/none", onNote: (n) => notes.push(n), env });
    expect(Object.keys(out).sort()).toEqual(GATES);
    expect(notes).toEqual([]);
  });

  it("runs all gates without throwing on a normal turn and threads a valid bundle", async () => {
    let g = freshGateState();
    g = await runPostTurnGates(g, { messages: msgs, safety, dataDir: "/tmp/none", onNote: () => {}, env: {} });
    g = await runPostTurnGates(g, { messages: msgs, safety, dataDir: "/tmp/none", onNote: () => {}, env: {} });
    expect(Object.keys(g).sort()).toEqual(GATES);
    expect(typeof g.stall.stalledTurns).toBe("number");
  });
});
