import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAmbientScreenCommand } from "./ambient-screen-cmd.js";

describe("runAmbientScreenCommand", () => {
  it("enables, redacts, ticks, and disables ambient screen mode", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-ambient-cli-"));
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((line = "") => { logs.push(String(line)); });
    try {
      expect(await runAmbientScreenCommand(root, ["enable", "--interval-sec", "1"])).toBe(0);
      expect(await runAmbientScreenCommand(root, ["redact", "SecretWindow"])).toBe(0);
      expect(await runAmbientScreenCommand(root, ["tick", "--context", "SecretWindow build failed"])).toBe(0);
      expect(await runAmbientScreenCommand(root, ["disable"])).toBe(0);
      expect(logs.join("\n")).toContain("ambient proposal: Fix failing tests");
      expect(logs.join("\n")).toContain("disabled");
    } finally {
      spy.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });
});
