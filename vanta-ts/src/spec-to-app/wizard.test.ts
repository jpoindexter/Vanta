import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractPostureRequirements, POSTURE_ROUTINE_SPEC_FIXTURE, runSpecToAppWizard, type Runner } from "./wizard.js";

describe("spec-to-app wizard", () => {
  it("extracts posture app requirements from the fixture", () => {
    const requirements = extractPostureRequirements(POSTURE_ROUTINE_SPEC_FIXTURE);
    expect(requirements).toContain("React implementation");
    expect(requirements).toContain("Tailwind-styled responsive interface");
    expect(requirements).toContain("localStorage progress persistence");
    expect(requirements).toContain("Accessible semantic controls and focus states");
  });

  it("scaffolds a preview, runs checks, and records evidence", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-spec-wizard-"));
    const runner: Runner = async (_cmd, args) => ({ code: 0, stdout: args.includes("build") ? "built in 10ms" : "typecheck ok", stderr: "" });
    try {
      const result = await runSpecToAppWizard({
        dataDir: dir,
        packageRoot: process.cwd(),
        runner,
        now: () => new Date("2026-07-09T14:00:00.000Z"),
      });
      expect(result.ok).toBe(true);
      expect(result.previewUrl).toContain("dist/index.html");
      expect(result.requirements).toContain("Routine timers with visible status");
      expect(await readFile(join(result.appDir, "src", "main.tsx"), "utf8")).toContain("localStorage");
      expect(await readFile(join(result.appDir, "implementation-plan.md"), "utf8")).toContain("React app");
      expect(await readFile(result.summaryFile, "utf8")).toContain("PASS build");
      expect(await readFile(result.screenshotFile, "utf8")).toContain("<svg");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
