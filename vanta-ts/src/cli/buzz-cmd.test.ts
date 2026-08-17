import { describe, expect, it, vi } from "vitest";
import {
  buildBuzzHarnessEnv,
  buzzReadiness,
  formatBuzzSetup,
  runBuzzCommand,
} from "./buzz-cmd.js";

describe("Buzz command", () => {
  it("builds the exact comma-delimited ACP launch contract Buzz expects", () => {
    expect(buildBuzzHarnessEnv({}, "/usr/local/bin/vanta")).toMatchObject({
      BUZZ_ACP_AGENT_COMMAND: "/usr/local/bin/vanta",
      BUZZ_ACP_AGENT_ARGS: "acp,serve",
    });
  });

  it("reports missing prerequisites without exposing secret values", () => {
    const result = buzzReadiness({ BUZZ_PRIVATE_KEY: "nsec-secret" }, () => false);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["buzz-acp", "buzz"]);
    expect(JSON.stringify(result)).not.toContain("nsec-secret");
  });

  it("prints setup instructions with a placeholder, never the configured key", () => {
    const output = formatBuzzSetup({
      BUZZ_PRIVATE_KEY: "nsec-secret",
      BUZZ_RELAY_URL: "wss://user:pass@buzz.example/ws?token=secret",
    }, "vanta");
    expect(output).toContain('BUZZ_PRIVATE_KEY="nsec1..."');
    expect(output).toContain('BUZZ_ACP_AGENT_ARGS="acp,serve"');
    expect(output).not.toContain("nsec-secret");
    expect(output).not.toContain("pass");
    expect(output).not.toContain("token=secret");
  });

  it("launches buzz-acp only when local prerequisites and identity exist", async () => {
    const log = vi.fn();
    const runHarness = vi.fn(async () => 0);
    const code = await runBuzzCommand("/repo", ["serve"], {
      env: { BUZZ_PRIVATE_KEY: "nsec-secret" },
      hasCommand: () => true,
      log,
      runHarness,
      agentCommand: "vanta",
    });
    expect(code).toBe(0);
    expect(runHarness).toHaveBeenCalledWith("/repo", expect.objectContaining({
      BUZZ_ACP_AGENT_COMMAND: "vanta",
      BUZZ_ACP_AGENT_ARGS: "acp,serve",
    }));
  });
});
