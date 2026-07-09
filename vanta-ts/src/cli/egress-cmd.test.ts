import { describe, expect, it } from "vitest";
import { formatEgress, inspectEgress, runEgressCommand } from "./egress-cmd.js";

const env = (over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => over as NodeJS.ProcessEnv;

describe("inspectEgress", () => {
  it("defaults to local backend, Docker no-network posture, and no HTTP policy", () => {
    expect(inspectEgress(env())).toEqual({
      dockerBackend: false,
      dockerNetwork: "none",
      appAllow: [],
      appDeny: [],
    });
  });

  it("reads Docker backend, network opening, and app-level allow/deny policy", () => {
    expect(inspectEgress(env({
      VANTA_EXEC_BACKEND: "docker",
      VANTA_SANDBOX_NET: "1",
      VANTA_EGRESS_ALLOW: "api.openai.com,api.anthropic.com",
      VANTA_EGRESS_DENY: "evil.test",
    }))).toEqual({
      dockerBackend: true,
      dockerNetwork: "host",
      appAllow: ["api.openai.com", "api.anthropic.com"],
      appDeny: ["evil.test"],
    });
  });
});

describe("formatEgress", () => {
  it("shows the hard no-egress Docker launch when network is closed", () => {
    const text = formatEgress(inspectEgress(env({ VANTA_EXEC_BACKEND: "docker" })));
    expect(text).toContain("docker backend: on");
    expect(text).toContain("--network none");
    expect(text).toContain("VANTA_EXEC_BACKEND=docker VANTA_SANDBOX_NET=0");
  });

  it("warns when app allowlists exist but Docker network is open", () => {
    const text = formatEgress(inspectEgress(env({ VANTA_SANDBOX_NET: "1", VANTA_EGRESS_ALLOW: "api.openai.com" })));
    expect(text).toContain("HTTP allowlist: api.openai.com");
    expect(text).toContain("not Docker");
  });
});

describe("runEgressCommand", () => {
  it("prints status and exits 0", () => {
    const lines: string[] = [];
    expect(runEgressCommand(["status"], env(), (line) => lines.push(line))).toBe(0);
    expect(lines.join("\n")).toContain("Egress isolation");
  });

  it("rejects unknown subcommands with usage", () => {
    const lines: string[] = [];
    expect(runEgressCommand(["bogus"], env(), (line) => lines.push(line))).toBe(1);
    expect(lines.join("\n")).toContain("usage: vanta egress");
  });
});
