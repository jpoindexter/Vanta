import { describe, it, expect } from "vitest";
import { runPostTurnGates, freshGateState } from "./repl/post-turn-gates.js";
import type { Message } from "./types.js";
import type { SafetyClient } from "./safety-client.js";

const safety = { getGoals: async () => [] } as unknown as SafetyClient;
const msgs: Message[] = [{ role: "user", content: "hi" }, { role: "assistant", content: "ok" }];
const GATES = ["nd", "research", "scopeDelta", "setShift", "stall", "wmManip"];
// runPostTurnGates always returns the heap-warn cooldown slot alongside the gates.
const BUNDLE = [...GATES, "memWarnLastAt"].sort();
const ONE_GB = 1024 * 1024 * 1024;
const HIGH_HEAP = 1.6 * ONE_GB; // above the 1.5 GB HIGH floor
const LOW_HEAP = 0.5 * ONE_GB;  // below it — silent

// Disable every EF gate so only the heap-warn gate can speak.
const SILENT_ENV: NodeJS.ProcessEnv = {
  VANTA_INHIBIT_THRESHOLD: "0", VANTA_SETSHIFT_THRESHOLD: "0", VANTA_STALL_THRESHOLD: "0",
  VANTA_SCOPE_DELTA_THRESHOLD: "0", VANTA_WM_MANIP_THRESHOLD: "0", VANTA_RESEARCH_GATE_TURNS: "0",
  VANTA_ND: "off",
};

describe("freshGateState", () => {
  it("initializes all gate states", () => {
    const g = freshGateState();
    expect(Object.keys(g).sort()).toEqual(GATES);
    expect(g.stall).toEqual({ stalledTurns: 0 });
    expect(g.nd).toBeDefined();
    expect(g.memWarnLastAt).toBeUndefined();
  });
});

describe("runPostTurnGates", () => {
  it("returns a complete new bundle and emits no notes when every gate is disabled", async () => {
    const notes: string[] = [];
    const out = await runPostTurnGates(freshGateState(), { messages: msgs, safety, dataDir: "/tmp/none", onNote: (n) => notes.push(n), env: SILENT_ENV, readHeap: () => LOW_HEAP });
    expect(Object.keys(out).sort()).toEqual(BUNDLE);
    expect(notes).toEqual([]);
  });

  it("runs all gates without throwing on a normal turn and threads a valid bundle", async () => {
    let g = freshGateState();
    g = await runPostTurnGates(g, { messages: msgs, safety, dataDir: "/tmp/none", onNote: () => {}, env: {}, readHeap: () => LOW_HEAP });
    g = await runPostTurnGates(g, { messages: msgs, safety, dataDir: "/tmp/none", onNote: () => {}, env: {}, readHeap: () => LOW_HEAP });
    expect(Object.keys(g).sort()).toEqual(BUNDLE);
    expect(typeof g.stall.stalledTurns).toBe("number");
  });

  it("emits a heap warning and stamps memWarnLastAt when heap is high", async () => {
    const notes: string[] = [];
    const out = await runPostTurnGates(freshGateState(), { messages: msgs, safety, dataDir: "/tmp/none", onNote: (n) => notes.push(n), env: SILENT_ENV, readHeap: () => HIGH_HEAP });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("[memory] HIGH:");
    expect(typeof out.memWarnLastAt).toBe("number");
  });

  it("emits nothing and leaves memWarnLastAt unset when heap is low", async () => {
    const notes: string[] = [];
    const out = await runPostTurnGates(freshGateState(), { messages: msgs, safety, dataDir: "/tmp/none", onNote: (n) => notes.push(n), env: SILENT_ENV, readHeap: () => LOW_HEAP });
    expect(notes).toEqual([]);
    expect(out.memWarnLastAt).toBeUndefined();
  });

  it("respects the cooldown — a second high reading within the window is silent but state persists", async () => {
    const notes: string[] = [];
    let g = await runPostTurnGates(freshGateState(), { messages: msgs, safety, dataDir: "/tmp/none", onNote: (n) => notes.push(n), env: SILENT_ENV, readHeap: () => HIGH_HEAP });
    const firstStamp = g.memWarnLastAt;
    g = await runPostTurnGates(g, { messages: msgs, safety, dataDir: "/tmp/none", onNote: (n) => notes.push(n), env: SILENT_ENV, readHeap: () => HIGH_HEAP });
    expect(notes).toHaveLength(1); // only the first emitted
    expect(g.memWarnLastAt).toBe(firstStamp); // cooldown preserved the stamp
  });
});
