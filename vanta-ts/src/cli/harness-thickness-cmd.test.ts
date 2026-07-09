import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHarnessThicknessCommand } from "./harness-thickness-cmd.js";

describe("runHarnessThicknessCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints a report and records history by default", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-thickness-"));
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => { logs.push(String(line)); });
    try {
      await mkdir(join(root, "vanta-ts", "src"), { recursive: true });
      await writeFile(join(root, "PROGRAM.md"), "TODO prune this scaffold.\n", "utf8");
      await writeFile(join(root, "SOUL.md"), "Never run destructive commands without approval.\n", "utf8");
      await writeFile(join(root, "vanta-ts", "src", "prompt.ts"), "export const x = 1;\n", "utf8");

      expect(await runHarnessThicknessCommand(root, [])).toBe(0);
      expect(logs.join("\n")).toContain("Harness Thickness Audit");
      expect(logs.join("\n")).toContain("recorded: .vanta/harness-thickness.jsonl");
      const history = await readFile(join(root, ".vanta", "harness-thickness.jsonl"), "utf8");
      expect(history).toContain('"candidateCount"');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("supports --no-record", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-thickness-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await writeFile(join(root, "PROGRAM.md"), "TODO prune this scaffold.\n", "utf8");
      expect(await runHarnessThicknessCommand(root, ["--no-record"])).toBe(0);
      await expect(readFile(join(root, ".vanta", "harness-thickness.jsonl"), "utf8")).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("removes a matching candidate line explicitly", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-thickness-"));
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => { logs.push(String(line)); });
    try {
      await writeFile(join(root, "PROGRAM.md"), "keep\nTODO prune this scaffold.\nkeep2\n", "utf8");
      expect(await runHarnessThicknessCommand(root, ["remove", "PROGRAM.md:2", "--expected", "TODO prune"])).toBe(0);
      expect(await readFile(join(root, "PROGRAM.md"), "utf8")).toBe("keep\nkeep2\n");
      expect(logs.join("\n")).toContain("removed PROGRAM.md:2");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses a stale remove target when expected text does not match", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-thickness-"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await writeFile(join(root, "PROGRAM.md"), "keep\nNever delete me\n", "utf8");
      expect(await runHarnessThicknessCommand(root, ["remove", "PROGRAM.md:2", "--expected", "TODO prune"])).toBe(1);
      expect(await readFile(join(root, "PROGRAM.md"), "utf8")).toContain("Never delete me");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
