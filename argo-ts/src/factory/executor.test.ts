import { describe, it, expect } from "vitest";
import { buildFactoryInstruction, parseTouchedFiles } from "./executor.js";
import type { FactoryPlan } from "./types.js";

const plan: FactoryPlan = {
  workItem: { category: "roadmap", description: "Add foo feature", sourceLine: 5 },
  instruction: "Implement foo",
  touchedDirs: ["argo-ts/src/tools"],
};

describe("buildFactoryInstruction", () => {
  it("includes the plan instruction and budget reminder", () => {
    const instr = buildFactoryInstruction(plan, 80_000);
    expect(instr).toContain("Implement foo");
    expect(instr).toContain("80000");
    expect(instr).toContain("co-located test");
  });

  it("includes CLAUDE.md/AGENTS.md update requirement for touched dirs", () => {
    const instr = buildFactoryInstruction(plan, 80_000);
    expect(instr).toContain("argo-ts/src/tools");
    expect(instr).toContain("CLAUDE.md");
  });

  it("mentions do-not-commit directive", () => {
    expect(buildFactoryInstruction(plan, 80_000)).toContain("Do not commit");
  });
});

describe("parseTouchedFiles", () => {
  it("parses git diff --name-only output into a list of strings", () => {
    const stdout = "argo-ts/src/tools/foo.ts\nargo-ts/src/tools/foo.test.ts\nROADMAP.md\n";
    expect(parseTouchedFiles(stdout)).toEqual([
      "argo-ts/src/tools/foo.ts",
      "argo-ts/src/tools/foo.test.ts",
      "ROADMAP.md",
    ]);
  });

  it("handles empty output", () => {
    expect(parseTouchedFiles("")).toEqual([]);
  });

  it("handles output with trailing newlines", () => {
    expect(parseTouchedFiles("\n\n")).toEqual([]);
  });
});
