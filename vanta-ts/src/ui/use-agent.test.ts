import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTurnGates } from "./use-agent.js";
import { freshGateState } from "../repl/post-turn-gates.js";
import { invalidateNdConfig } from "../nd/profile.js";

// Proves the ND executive-function engine fires in the DEFAULT TUI host (not just
// the readline REPL): runTurnGates → runPostTurnGates → ndGatesAfterTurn → a note.

type Action = { t: string; text?: string };

function makeDeps(messages: { role: string; content: string }[], notes: Action[]) {
  return {
    setup: { safety: { getGoals: async () => [] } },
    repoRoot: mkdtempSync(join(tmpdir(), "vanta-tui-gates-")),
    dispatch: (a: Action) => { if (a.t === "note") notes.push(a); },
    convoRef: { current: { messages } },
    replStateRef: { current: { turnIndex: 1, started: new Date(0).toISOString() } },
    gatesRef: { current: freshGateState() },
  };
}

describe("runTurnGates (TUI EF-engine wiring)", () => {
  beforeEach(() => {
    invalidateNdConfig();
    process.env.VANTA_HOME = mkdtempSync(join(tmpdir(), "vanta-home-"));
    delete process.env.VANTA_ND; // engine on by default
  });

  it("fires the complexity gate as a transcript note on a complex turn", async () => {
    const notes: Action[] = [];
    const deps = makeDeps(
      [{ role: "user", content: "refactor and rewrite the schema with a multi-file migration" }],
      notes,
    );
    await runTurnGates(deps as never);
    expect(notes.some((n) => (n.text ?? "").includes("🧭"))).toBe(true);
  });

  it("stays silent on a simple turn (no false nudges)", async () => {
    const notes: Action[] = [];
    const deps = makeDeps([{ role: "user", content: "what time is it?" }], notes);
    await runTurnGates(deps as never);
    expect(notes).toHaveLength(0);
  });

  it("threads gate state across turns", async () => {
    const notes: Action[] = [];
    const deps = makeDeps([{ role: "user", content: "hello" }], notes);
    const before = deps.gatesRef.current;
    await runTurnGates(deps as never);
    expect(deps.gatesRef.current).not.toBe(before); // a new advanced state object
  });
});
