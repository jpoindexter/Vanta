import { describe, it, expect } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildFactoryInstruction, parseTouchedFiles, readDirContexts } from "./executor.js";
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

describe("readDirContexts", () => {
  let tmp: string;

  it("returns CLAUDE.md content for dirs that have one", async () => {
    tmp = await (await import("node:fs/promises")).mkdtemp(join(tmpdir(), "vanta-exec-"));
    try {
      const dir = join(tmp, "src", "tools");
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "CLAUDE.md"), "# tools CLAUDE.md\nsome context");
      const contexts = await readDirContexts(tmp, ["src/tools"]);
      expect(contexts).toHaveLength(1);
      expect(contexts[0]).toContain("tools CLAUDE.md");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("skips dirs without a CLAUDE.md", async () => {
    tmp = await (await import("node:fs/promises")).mkdtemp(join(tmpdir(), "vanta-exec-"));
    try {
      const dir = join(tmp, "src", "empty");
      await mkdir(dir, { recursive: true });
      const contexts = await readDirContexts(tmp, ["src/empty"]);
      expect(contexts).toHaveLength(0);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("returns empty array for empty dirs list", async () => {
    expect(await readDirContexts("/any", [])).toEqual([]);
  });
});
