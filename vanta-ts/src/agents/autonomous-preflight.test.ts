import { describe, it, expect } from "vitest";
import { autonomousPreflight, agentImageBuildArgs, agentDockerfilePath, type ExecProbe } from "./autonomous-preflight.js";

// Universal-use guard: before running a boxed agent, check Docker + the image are actually there and
// return an ACTIONABLE setup message instead of a cryptic `docker run` failure. Probe is injected.
const probe = (results: Record<string, { ok: boolean; stdout: string }>): ExecProbe =>
  (cmd, args) => results[`${cmd} ${args[0]}`] ?? { ok: false, stdout: "" };

describe("autonomousPreflight — actionable readiness check for any machine", () => {
  it("is ready when Docker is up and the image exists", () => {
    const r = autonomousPreflight("vanta-agent", probe({
      "docker version": { ok: true, stdout: "29.4.0" },
      "docker images": { ok: true, stdout: "sha256abc\n" },
    }));
    expect(r.ready).toBe(true);
  });

  it("fails with an install hint when Docker is not available", () => {
    const r = autonomousPreflight("vanta-agent", probe({ "docker version": { ok: false, stdout: "" } }));
    expect(r.ready).toBe(false);
    expect(r.reason).toMatch(/docker/i);
    expect(r.hint).toMatch(/install/i);
  });

  it("fails with a build hint when the image is missing", () => {
    const r = autonomousPreflight("vanta-agent", probe({
      "docker version": { ok: true, stdout: "29.4.0" },
      "docker images": { ok: true, stdout: "" }, // no image id → not built
    }));
    expect(r.ready).toBe(false);
    expect(r.reason).toMatch(/image/i);
    expect(r.hint).toMatch(/build/i);
    expect(r.hint).toContain("vanta-agent");
  });
});

describe("agent image build", () => {
  it("builds the docker build argv from image + dockerfile (context = its dir)", () => {
    expect(agentImageBuildArgs("vanta-agent", "/x/docker/agent.Dockerfile"))
      .toEqual(["build", "-t", "vanta-agent", "-f", "/x/docker/agent.Dockerfile", "/x/docker"]);
  });
  it("resolves the bundled Dockerfile path", () => {
    expect(agentDockerfilePath()).toMatch(/docker\/agent\.Dockerfile$/);
  });
});
