import { describe, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runIntentCommand } from "./intent-cmd.js";

describe("runIntentCommand", () => {
  it("extracts and checks an intent spec artifact", async () => {
    const dir = join(tmpdir(), `vanta-intent-cli-${Date.now()}`);
    const target = join(dir, "feature.ts");
    const spec = join(dir, "feature.intent.json");
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((line = "") => { logs.push(String(line)); });
    await mkdir(dir, { recursive: true });
    try {
      await writeFile(target, "export function runFeature() { return true; }\n");
      expect(await runIntentCommand(["extract", target, "--out", spec])).toBe(0);
      expect(logs.join("\n")).toContain("Reviewable intent");
      expect(await runIntentCommand(["check", target, spec])).toBe(0);

      await writeFile(target, "export function runOtherThing() { return true; }\n");
      expect(await runIntentCommand(["check", target, spec])).toBe(2);
    } finally {
      spy.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
