import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GREG_UITESTS_CRASH_FIXTURE } from "../diagnose/crash.js";
import { runCrashDiagnoseCommand } from "./crash-diagnose-cmd.js";

async function capture(fn: () => Promise<number>): Promise<{ code: number; output: string }> {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((msg = "") => { lines.push(String(msg)); });
  try {
    return { code: await fn(), output: lines.join("\n") };
  } finally {
    spy.mockRestore();
  }
}

describe("runCrashDiagnoseCommand", () => {
  it("runs the GregUITests demo fixture", async () => {
    const result = await capture(() => runCrashDiagnoseCommand(["--demo", "greg-uitests"]));
    expect(result.code).toBe(0);
    expect(result.output).toContain("Missing dynamic library: @rpath/lib_TestingInterop.dylib");
    expect(result.output).toContain("L6: Library not loaded");
  });

  it("reads a crash report file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-crash-"));
    const file = join(dir, "greg.crash");
    try {
      await writeFile(file, GREG_UITESTS_CRASH_FIXTURE, "utf8");
      const result = await capture(() => runCrashDiagnoseCommand([file]));
      expect(result.code).toBe(0);
      expect(result.output).toContain("Runpath Search Paths");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
