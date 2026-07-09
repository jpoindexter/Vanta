import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWhatCanIDoCommand } from "./what-can-i-do-cmd.js";

async function capture(fn: () => Promise<number>): Promise<{ code: number; output: string }> {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((msg = "") => { lines.push(String(msg)); });
  try {
    return { code: await fn(), output: lines.join("\n") };
  } finally {
    spy.mockRestore();
  }
}

describe("runWhatCanIDoCommand", () => {
  it("prints the workflow gallery from the live registry", async () => {
    const result = await capture(() => runWhatCanIDoCommand([]));
    expect(result.code).toBe(0);
    expect(result.output).toContain("What Vanta can do now");
    expect(result.output).toContain("Fix a pasted error");
    expect(result.output).toContain("Needs:");
  });

  it("prints linked demo fixtures", async () => {
    const result = await capture(() => runWhatCanIDoCommand(["--demo", "fix-error"]));
    expect(result.code).toBe(0);
    expect(result.output).toContain("Demo: Fix a pasted error");
    expect(result.output).toContain("VANTA_SHELL_SANDBOX=0 vanta");
  });

  it("runs the cold activation check", async () => {
    const result = await capture(() => runWhatCanIDoCommand(["--check"]));
    expect(result.code).toBe(0);
    expect(result.output).toContain("Cold activation check: PASS");
    expect(result.output).toMatch(/Time-to-first-useful-action: \d+ms/);
  });

  it("runs and records the fresh-workspace activation check", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-fresh-cli-"));
    try {
      const result = await capture(() => runWhatCanIDoCommand(["--fresh-workspace-check"], dir));
      expect(result.code).toBe(0);
      expect(result.output).toContain("Fresh-workspace activation proof: PASS");
      const file = result.output.match(/Evidence: (.+)/)?.[1];
      expect(file).toBeTruthy();
      expect(await readFile(file!, "utf8")).toContain("Fresh-Workspace Activation Proof");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prints the fresh-context review packet", async () => {
    const result = await capture(() => runWhatCanIDoCommand(["--review-packet"]));
    expect(result.code).toBe(0);
    expect(result.output).toContain("Fresh-context activation review packet");
    expect(result.output).toContain("Record");
  });

  it("records a fresh-context review evidence file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-review-cli-"));
    try {
      const result = await capture(() => runWhatCanIDoCommand(["--record-review", "First choice was unclear"], dir));
      expect(result.code).toBe(0);
      expect(result.output).toContain("fresh-context review recorded");
      const file = result.output.split("→ ")[1]!.trim();
      expect(await readFile(file, "utf8")).toContain("First choice was unclear");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
