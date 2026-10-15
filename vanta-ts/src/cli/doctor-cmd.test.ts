import { describe, expect, it, vi } from "vitest";
import { runDoctorCommand } from "./doctor-cmd.js";

describe("runDoctorCommand", () => {
  it("prints health, a read-only context report, and the semantic follow-up", async () => {
    const status = vi.fn(async () => {});
    const context = vi.fn(async () => "=== Harness Thickness Audit ===");
    const lines: string[] = [];

    expect(
      await runDoctorCommand("/repo", ["--limit", "3"], {
        status,
        context,
        log: (line) => lines.push(line),
      }),
    ).toBe(0);

    expect(status).toHaveBeenCalledWith(["--limit", "3"]);
    expect(context).toHaveBeenCalledWith("/repo", 3);
    expect(lines.join("\n")).toContain("Harness Thickness Audit");
    expect(lines.join("\n")).toContain("vanta skill context-doctor");
  });
});
