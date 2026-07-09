import { describe, expect, it, vi } from "vitest";
import { runWhatCanIDoCommand } from "./what-can-i-do-cmd.js";

function capture(fn: () => number): { code: number; output: string } {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((msg = "") => { lines.push(String(msg)); });
  try {
    return { code: fn(), output: lines.join("\n") };
  } finally {
    spy.mockRestore();
  }
}

describe("runWhatCanIDoCommand", () => {
  it("prints the workflow gallery from the live registry", () => {
    const result = capture(() => runWhatCanIDoCommand([]));
    expect(result.code).toBe(0);
    expect(result.output).toContain("What Vanta can do now");
    expect(result.output).toContain("Fix a pasted error");
    expect(result.output).toContain("Needs:");
  });

  it("prints linked demo fixtures", () => {
    const result = capture(() => runWhatCanIDoCommand(["--demo", "fix-error"]));
    expect(result.code).toBe(0);
    expect(result.output).toContain("Demo: Fix a pasted error");
    expect(result.output).toContain("VANTA_SHELL_SANDBOX=0 vanta");
  });

  it("runs the cold activation check", () => {
    const result = capture(() => runWhatCanIDoCommand(["--check"]));
    expect(result.code).toBe(0);
    expect(result.output).toContain("Cold activation check: PASS");
    expect(result.output).toMatch(/Time-to-first-useful-action: \d+ms/);
  });
});
