import { describe, expect, it } from "vitest";
import { a2aAutonomousReadiness, formatA2aAutonomousReadiness } from "./autonomous-sandbox-readiness.js";
import type { ExecProbe } from "./autonomous-preflight.js";

const probe = (results: Record<string, { ok: boolean; stdout: string }>): ExecProbe =>
  (cmd, args) => results[`${cmd} ${args[0]}`] ?? { ok: false, stdout: "" };

const noAuth = () => null;

describe("a2aAutonomousReadiness", () => {
  it("reports the concrete missing gates before an autonomous sandbox proof can run", () => {
    const status = a2aAutonomousReadiness({
      root: "/repo",
      env: {},
      readAuth: noAuth,
      probe: probe({ "docker version": { ok: false, stdout: "" } }),
      receipt: null,
    });
    expect(status.ready).toBe(false);
    expect(status.roadmapCardId).toBe("VANTA-A2A-DOCKER-AUTONOMOUS");
    expect(status.gates.map((g) => [g.id, g.ready])).toEqual([
      ["docker", false],
      ["image", false],
      ["credential", false],
      ["proof", false],
    ]);
    expect(status.gates.find((g) => g.id === "docker")?.nextActions[0]).toMatch(/Start Docker/);
    expect(formatA2aAutonomousReadiness(status)).toContain("A2A autonomous sandbox: not ready");
  });

  it("is ready only when Docker, image, credential, and npm-driven Docker receipt are present", () => {
    const status = a2aAutonomousReadiness({
      root: "/repo",
      env: { ANTHROPIC_API_KEY: "sk-test" } as NodeJS.ProcessEnv,
      readAuth: noAuth,
      probe: probe({
        "docker version": { ok: true, stdout: "29.0.0\n" },
        "docker images": { ok: true, stdout: "sha256abc\n" },
      }),
      receipt: JSON.stringify({ provedAt: "2026-07-10T00:00:00.000Z", container: "docker", npmDriven: true }),
    });
    expect(status.ready).toBe(true);
    expect(status.gates.every((g) => g.ready)).toBe(true);
    expect(status.gates.find((g) => g.id === "credential")?.evidence).toContain("ANTHROPIC_API_KEY");
  });
});
