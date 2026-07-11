import { describe, expect, it } from "vitest";
import { runScriptedTurns, type ScriptedScenario } from "./multiturn.js";

const outcome = (finalText: string, toolIterations = 0) => ({
  finalText, toolIterations, iterations: 1, stoppedReason: "done",
});

describe("multi-turn story runner", () => {
  it("keeps one conversation through clarification, approval, and rejection", async () => {
    const sent: string[] = [];
    const outputs = [
      outcome("Which onboarding outcome matters most?"),
      outcome("Plan: shorten install and first run. Approve this plan?", 1),
      outcome("Rejected. I stopped without changing files."),
    ];
    const toolEvents = [[], [{ name: "inspect_state", ok: true }], []];
    const scenario: ScriptedScenario = {
      id: "clarify-plan-reject",
      instruction: "Improve onboarding, but clarify before acting.",
      firstTurn: { boundary: "clarification", checks: ["outcome", "?"] },
      operatorReplies: [
        { reply: "Faster first successful run.", boundary: "approval", checks: ["Plan:", "Approve"] },
        { reply: "Reject the plan and stop.", boundary: "reject", checks: ["Rejected", "without changing"] },
      ],
      forbiddenPatterns: ["edit_file", "write_file"],
    };

    const receipt = await runScriptedTurns(scenario, {
      send: async (text) => { sent.push(text); return outputs.shift()!; },
      drainToolEvents: () => toolEvents.shift()!,
      redact: (text) => text,
    });

    expect(sent).toEqual([scenario.instruction, ...scenario.operatorReplies.map((turn) => turn.reply)]);
    expect(receipt.turns.map((turn) => turn.boundary)).toEqual(["clarification", "approval", "reject"]);
    expect(receipt.turns[1]?.tools).toEqual([{ name: "inspect_state", ok: true }]);
    expect(receipt.turns.every((turn) => turn.passed)).toBe(true);
    expect(receipt.passed).toBe(true);
  });

  it("resumes a paused conversation and records a deterministic guard failure", async () => {
    const outputs = [outcome("Paused at approval."), outcome("Resumed and completed the brief.")];
    const scenario: ScriptedScenario = {
      id: "resume-branch",
      instruction: "Pause before delivery.",
      firstTurn: { boundary: "approval", checks: ["Paused"] },
      operatorReplies: [{ reply: "Resume, but do not send.", boundary: "resume", checks: ["Resumed", "completed"] }],
      forbiddenPatterns: ["send_message"],
    };
    let turn = 0;
    const receipt = await runScriptedTurns(scenario, {
      send: async () => outputs.shift()!,
      drainToolEvents: () => turn++ === 0 ? [] : [{ name: "send_message", ok: true }],
      redact: (text) => text,
    });

    expect(receipt.turns[1]).toMatchObject({ boundary: "resume", boundaryPassed: true, guardPassed: false, passed: false });
    expect(receipt.passed).toBe(false);
  });
});
