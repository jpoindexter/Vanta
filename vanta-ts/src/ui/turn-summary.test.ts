import { describe, expect, it } from "vitest";
import { buildTurnSummary, turnSummaryLines } from "./turn-summary.js";
import type { ToolEntry } from "./types.js";

const tool = (fields: Partial<ToolEntry>): ToolEntry => ({
  kind: "tool",
  name: "read_file",
  verb: "read",
  detail: "src/app.ts",
  ok: true,
  ...fields,
});

describe("turn summary", () => {
  it("reports changed targets, checks, and verification from tool evidence", () => {
    const summary = buildTurnSummary([
      tool({ name: "write_file", verb: "wrote", detail: "src/app.ts" }),
      tool({ name: "read_file", verb: "read", detail: "src/app.ts" }),
      tool({ name: "shell_cmd", verb: "ran", detail: "npm test" }),
    ]);

    expect(summary).toMatchObject({
      actions: 3,
      changed: ["src/app.ts"],
      checked: 1,
      verificationPassed: 1,
      verificationFailed: 0,
      failures: 0,
    });
    expect(turnSummaryLines(summary!)).toContain("Verification: 1 passed");
    expect(turnSummaryLines(summary!)).toContain("Next: Ready for review");
  });

  it("never invents verification when no verification command ran", () => {
    const summary = buildTurnSummary([tool({ name: "write_file", verb: "wrote" })]);
    expect(turnSummaryLines(summary!)).toContain("Verification: Not run");
  });

  it("surfaces failed actions and sends the operator to trace evidence", () => {
    const summary = buildTurnSummary([
      tool({ name: "shell_cmd", verb: "ran", detail: "npm test", ok: false }),
    ]);
    expect(summary).toMatchObject({ verificationFailed: 1, failures: 1 });
    expect(turnSummaryLines(summary!)).toContain("Verification: 0 passed · 1 failed");
    expect(turnSummaryLines(summary!)).toContain("Next: Review failed actions in Ctrl+T evidence");
  });

  it("marks an identical successful retry as recovered instead of leaving a false failure", () => {
    const summary = buildTurnSummary([
      tool({ name: "shell_cmd", verb: "ran", detail: "python3 search_jobs.py", ok: false }),
      tool({ name: "shell_cmd", verb: "ran", detail: "python3 search_jobs.py", ok: true }),
    ]);

    expect(summary).toMatchObject({ failures: 0, recoveredFailures: 1 });
    expect(turnSummaryLines(summary!)).toContain("Recovered: 1 transient failure");
    expect(turnSummaryLines(summary!)).toContain("Next: Ready for review");
  });

  it("keeps a failed action unresolved when a different command later succeeds", () => {
    const summary = buildTurnSummary([
      tool({ name: "shell_cmd", verb: "ran", detail: "python3 search_jobs.py", ok: false }),
      tool({ name: "shell_cmd", verb: "ran", detail: "python3 rank_jobs.py", ok: true }),
    ]);

    expect(summary).toMatchObject({ failures: 1, recoveredFailures: 0 });
    expect(turnSummaryLines(summary!)).toContain("Next: Review failed actions in Ctrl+T evidence");
  });

  it("does not create a closeout for a conversation-only turn", () => {
    expect(buildTurnSummary([])).toBeNull();
  });
});
