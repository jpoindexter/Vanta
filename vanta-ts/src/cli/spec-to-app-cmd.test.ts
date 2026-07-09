import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSpecToAppCommand } from "./spec-to-app-cmd.js";

async function capture(fn: () => Promise<number>): Promise<{ code: number; output: string }> {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((msg = "") => { lines.push(String(msg)); });
  try {
    return { code: await fn(), output: lines.join("\n") };
  } finally {
    spy.mockRestore();
  }
}

describe("runSpecToAppCommand", () => {
  it("runs the posture demo and reports evidence paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-spec-cli-"));
    try {
      await symlink(process.cwd(), join(root, "vanta-ts"), "dir");
      const result = await capture(() => runSpecToAppCommand(root, ["--demo", "posture"]));
      expect(result.code).toBe(0);
      expect(result.output).toContain("Spec-to-app preview: PASS");
      expect(result.output).toContain("Summary:");
      expect(result.output).toContain("Screenshot evidence:");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
