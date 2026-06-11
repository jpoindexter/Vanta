import { describe, it, expect, vi } from "vitest";
import { parseScore, parseEscalation, runLoopIteration } from "./runner.js";
import { LoopDefSchema, newState } from "./types.js";
import { raiseEscalation, markInProgress } from "./state.js";

// Shared base def factory — override fields per-test.
function makeDef(overrides?: object) {
  return LoopDefSchema.parse({
    id: "test-loop",
    goal: "improve the thing",
    trigger: { kind: "manual" },
    stages: [
      { name: "execute", prompt: "do the work" },
      { name: "evaluate", prompt: "score the work" },
    ],
    rubric: { items: [], passScore: 0.8 },
    stop: { maxIterations: 10, noProgressWakes: 3 },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

const FIXED_NOW = new Date("2026-06-11T12:00:00.000Z");
const fixedNow = () => FIXED_NOW;

// --- parseScore ---

describe("parseScore", () => {
  it("parses a decimal score", () => {
    expect(parseScore("some text SCORE: 0.9 more text")).toBe(0.9);
  });

  it("is case-insensitive", () => {
    expect(parseScore("score: 0.75")).toBe(0.75);
    expect(parseScore("Score: 1")).toBe(1);
  });

  it("clamps above 1 to 1", () => {
    expect(parseScore("SCORE: 1.5")).toBe(1);
  });

  it("clamps below 0 to 0", () => {
    expect(parseScore("SCORE: -0.3")).toBe(0);
  });

  it("returns null when absent", () => {
    expect(parseScore("no score here")).toBeNull();
  });

  it("returns null for garbage value", () => {
    expect(parseScore("SCORE: abc")).toBeNull();
  });
});

// --- parseEscalation ---

describe("parseEscalation", () => {
  it("extracts a reason from a multiline output", () => {
    const text = "some analysis\nESCALATE: needs an API key\nmore text";
    expect(parseEscalation(text)).toBe("needs an API key");
  });

  it("is case-insensitive", () => {
    expect(parseEscalation("escalate: missing credential")).toBe("missing credential");
  });

  it("trims to the first line of the match", () => {
    expect(parseEscalation("ESCALATE: first line\nsecond line")).toBe("first line");
  });

  it("returns null when absent", () => {
    expect(parseEscalation("everything looks fine SCORE: 0.9")).toBeNull();
  });
});

// --- runLoopIteration: pass ---

describe("runLoopIteration — pass", () => {
  it("stops with status done and reason starting with 'passed' on high score", async () => {
    const def = makeDef();
    const state = newState("test-loop");

    const runStage = vi.fn().mockImplementation(({ stage }) => {
      if (stage.name === "evaluate") return Promise.resolve("looks great SCORE: 0.95");
      return Promise.resolve("execute output");
    });

    const result = await runLoopIteration(def, state, { runStage, now: fixedNow });

    expect(result.stopped).toBe(true);
    expect(result.def.status).toBe("done");
    expect(result.reason).toMatch(/^passed/);
    expect(result.score).toBe(0.95);
  });
});

// --- runLoopIteration: maxIterations ---

describe("runLoopIteration — maxIterations", () => {
  it("stops after one call when maxIterations is 1 and score is low", async () => {
    const def = makeDef({ stop: { maxIterations: 1, noProgressWakes: 3 } });
    const state = newState("test-loop");

    const runStage = vi.fn().mockImplementation(({ stage }) => {
      if (stage.name === "evaluate") return Promise.resolve("SCORE: 0.3");
      return Promise.resolve("did stuff");
    });

    const result = await runLoopIteration(def, state, { runStage, now: fixedNow });

    expect(result.stopped).toBe(true);
    expect(result.def.status).toBe("done");
    expect(result.reason).toMatch(/max iterations/);
  });
});

// --- runLoopIteration: no-progress kill ---

describe("runLoopIteration — no-progress kill", () => {
  it("kills after noProgressWakes consecutive non-improving iterations", async () => {
    const def = makeDef({ stop: { maxIterations: 10, noProgressWakes: 2 } });
    let callCount = 0;
    const runStage = vi.fn().mockImplementation(({ stage }) => {
      callCount++;
      if (stage.name === "evaluate") return Promise.resolve("SCORE: 0.3");
      return Promise.resolve("no improvement");
    });

    // First iteration: score 0.3 → bestScore 0.3, streak 0 (first improvement)
    const result1 = await runLoopIteration(def, newState("test-loop"), { runStage, now: fixedNow });
    expect(result1.stopped).toBe(false);

    // Second iteration: score 0.3 again → no improvement → streak 1
    const result2 = await runLoopIteration(def, result1.state, { runStage, now: fixedNow });
    expect(result2.stopped).toBe(false);

    // Third iteration: score 0.3 again → streak 2 ≥ noProgressWakes(2) → kill
    const result3 = await runLoopIteration(def, result2.state, { runStage, now: fixedNow });
    expect(result3.stopped).toBe(true);
    expect(result3.def.status).toBe("killed");
    expect(result3.reason).toMatch(/no progress/);
  });
});

// --- runLoopIteration: gate failure ---

describe("runLoopIteration — gate failure", () => {
  it("records gate failed reason and does not call later stages", async () => {
    const def = makeDef({
      stages: [
        { name: "execute", prompt: "work", gate: "check-gate.sh" },
        { name: "evaluate", prompt: "score it" },
      ],
    });
    const state = newState("test-loop");

    const runGate = vi.fn().mockResolvedValue(false);
    const runStage = vi.fn();

    const result = await runLoopIteration(def, state, { runStage, now: fixedNow, runGate });

    expect(result.reason).toMatch(/^gate failed: execute/);
    // Neither the gated stage nor any later stage ran
    expect(runStage).not.toHaveBeenCalled();
    expect(result.state.lessons).toContain("gate failed at execute");
  });
});

// --- runLoopIteration: prior threading ---

describe("runLoopIteration — prior threading", () => {
  it("passes execute stage output into evaluate stage prior", async () => {
    const def = makeDef();
    const state = newState("test-loop");
    const capturedArgs: Array<{ stage: { name: string }; prior: string }> = [];

    const runStage = vi.fn().mockImplementation((args) => {
      capturedArgs.push(args);
      if (args.stage.name === "evaluate") return Promise.resolve("SCORE: 0.5");
      return Promise.resolve("execute was here");
    });

    await runLoopIteration(def, state, { runStage, now: fixedNow });

    const evalArgs = capturedArgs.find((a) => a.stage.name === "evaluate");
    expect(evalArgs).toBeDefined();
    expect(evalArgs!.prior).toContain("execute was here");
  });
});

// --- runLoopIteration: escalation during a stage ---

describe("runLoopIteration — escalation", () => {
  it("pauses on ESCALATE output, stops further stages, records an open escalation", async () => {
    const def = makeDef({
      stages: [
        { name: "execute", prompt: "do the work" },
        { name: "evaluate", prompt: "score it" },
        { name: "improve", prompt: "improve it" },
      ],
    });
    const state = newState("test-loop");
    const evaluateSpy = vi.fn().mockResolvedValue("SCORE: 0.5");
    const improveSpy = vi.fn().mockResolvedValue("improved");

    const runStage = vi.fn().mockImplementation(({ stage }) => {
      if (stage.name === "execute") return Promise.resolve("ESCALATE: needs an API key");
      if (stage.name === "evaluate") return evaluateSpy();
      return improveSpy();
    });

    const result = await runLoopIteration(def, state, { runStage, now: fixedNow });

    expect(result.stopped).toBe(true);
    expect(result.def.status).toBe("paused");
    expect(result.reason).toMatch(/^escalated/);
    expect(result.state.escalations).toHaveLength(1);
    expect(result.state.escalations[0]!.status).toBe("open");
    expect(result.state.escalations[0]!.reason).toBe("needs an API key");
    // evaluate and improve stages must NOT have run
    expect(evaluateSpy).not.toHaveBeenCalled();
    expect(improveSpy).not.toHaveBeenCalled();
  });
});

// --- runLoopIteration: crash recovery ---

describe("runLoopIteration — crash recovery", () => {
  it("appends a recovery lesson when inProgress is true on entry", async () => {
    const def = makeDef();
    // Simulate a state left behind by a crashed iteration
    const crashedState = markInProgress(newState("test-loop"), true);

    const runStage = vi.fn().mockImplementation(({ stage }) => {
      if (stage.name === "evaluate") return Promise.resolve("SCORE: 0.5");
      return Promise.resolve("work done");
    });

    const result = await runLoopIteration(def, crashedState, { runStage, now: fixedNow });

    expect(result.state.lessons).toContain(
      "previous iteration did not finish cleanly (recovered)",
    );
    expect(result.state.inProgress).toBe(false);
  });
});

// --- runLoopIteration: open-escalation guard ---

describe("runLoopIteration — open-escalation guard", () => {
  it("refuses to run when there is an open escalation", async () => {
    const def = makeDef();
    const stateWithEsc = raiseEscalation(newState("test-loop"), "needs human review", FIXED_NOW);

    const runStage = vi.fn();

    const result = await runLoopIteration(def, stateWithEsc, { runStage, now: fixedNow });

    expect(result.stopped).toBe(true);
    expect(result.def.status).toBe("paused");
    expect(result.reason).toMatch(/^blocked/);
    expect(runStage).not.toHaveBeenCalled();
  });
});
