import { describe, it, expect } from "vitest";
import { runEfGates, emptyEfState, defaultNdConfig, setGateEnabled } from "./engine.js";
import type { EfSignals } from "./types.js";

const sig = (over: Partial<EfSignals> = {}): EfSignals => ({
  turnIndex: 1, lastUserMessage: "", toolNames: [], producedText: true,
  wroteFiles: false, committed: false, activeGoalText: null, elapsedMin: 0,
  captures: 0, ships: 0, ...over,
});

/** Run N turns of the same signal shape, threading state. */
function runTurns(signals: EfSignals[], cfg = defaultNdConfig()) {
  let state = emptyEfState();
  const all: string[] = [];
  signals.forEach((s, i) => {
    const r = runEfGates({ ...s, turnIndex: i + 1 }, state, cfg);
    state = r.state;
    all.push(...r.nudges);
  });
  return all;
}

describe("runEfGates — research-gate", () => {
  it("fires after N read-only turns (default 8)", () => {
    const reads = Array.from({ length: 8 }, () => sig({ toolNames: ["read_file"], producedText: false, wroteFiles: false }));
    const nudges = runTurns(reads);
    expect(nudges.some((n) => n.includes("reading/analysis"))).toBe(true);
  });
  it("does NOT fire when a write breaks the read-only streak", () => {
    const seq = [...Array.from({ length: 7 }, () => sig({ toolNames: ["read_file"], producedText: false })), sig({ wroteFiles: true })];
    expect(runTurns(seq).some((n) => n.includes("reading/analysis"))).toBe(false);
  });
});

describe("runEfGates — hyperfocus-guard", () => {
  it("fires after a long single-area run (default 12)", () => {
    const seq = Array.from({ length: 12 }, () => sig({ toolNames: ["grep_files"], producedText: false }));
    expect(runTurns(seq).some((n) => n.includes("deep in"))).toBe(true);
  });
});

describe("runEfGates — config toggles", () => {
  it("a disabled gate never fires", () => {
    const cfg = setGateEnabled(defaultNdConfig(), "research", false);
    const reads = Array.from({ length: 16 }, () => sig({ toolNames: ["read_file"], producedText: false }));
    expect(runTurns(reads, cfg).some((n) => n.includes("reading/analysis"))).toBe(false);
  });

  it("defaultNdConfig has every gate with a threshold", () => {
    const cfg = defaultNdConfig();
    for (const id of ["research", "complexity", "task-initiation", "hyperfocus", "time-blindness", "closure", "velocity", "set-shift", "inhibit"] as const) {
      expect(cfg[id]).toBeDefined();
      expect(typeof cfg[id].threshold).toBe("number");
    }
  });
});

describe("runEfGates — single-gate triggers", () => {
  it("complexity-gate fires on a multi-signal message", () => {
    const r = runEfGates(sig({ turnIndex: 1, lastUserMessage: "refactor the schema and rewrite the migration" }), emptyEfState(), defaultNdConfig());
    expect(r.nudges.some((n) => n.includes("multi-part"))).toBe(true);
  });
  it("task-initiation fires on a stall phrase", () => {
    const r = runEfGates(sig({ lastUserMessage: "i don't know where to start" }), emptyEfState(), defaultNdConfig());
    expect(r.nudges.some((n) => n.includes("smallest first step"))).toBe(true);
  });
  it("inhibit fires after 3 no-output turns", () => {
    const seq = Array.from({ length: 3 }, () => sig({ toolNames: ["read_file"], producedText: false }));
    expect(runTurns(seq).some((n) => n.includes("possible drift"))).toBe(true);
  });
  it("closure fires after 3 uncommitted writes", () => {
    const seq = Array.from({ length: 3 }, () => sig({ toolNames: ["write_file"], wroteFiles: true }));
    expect(runTurns(seq).some((n) => n.includes("without a commit"))).toBe(true);
  });
  it("velocity-check fires once on a high capture:ship ratio", () => {
    const r = runEfGates(sig({ captures: 10, ships: 1 }), emptyEfState(), { ...defaultNdConfig(), velocity: { enabled: true, threshold: 5 } });
    expect(r.nudges.some((n) => n.includes("Capture:ship"))).toBe(true);
  });
  it("time-blindness fires when elapsed crosses the threshold", () => {
    const r = runEfGates(sig({ elapsedMin: 50 }), emptyEfState(), { ...defaultNdConfig(), "time-blindness": { enabled: true, threshold: 45 } });
    expect(r.nudges.some((n) => n.includes("on this session"))).toBe(true);
  });
});
