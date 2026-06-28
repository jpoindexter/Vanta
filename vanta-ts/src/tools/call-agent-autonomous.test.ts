import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { autonomousInvocation } from "./call-agent.js";
import { buildAgentInvocation } from "../agents/external-cli.js";

// An explicit env credential makes resolveBoxCredential deterministic AND keeps the tests from
// reading the host keychain.
describe("call_agent autonomous — claude boxed in a mount-scoped container, env-authed", () => {
  beforeEach(() => { process.env.ANTHROPIC_API_KEY = "sk-test-box"; });
  afterEach(() => { delete process.env.ANTHROPIC_API_KEY; });

  it("builds claude with --dangerously-skip-permissions (autonomous flag)", () => {
    const inv = buildAgentInvocation("claude", "build a landing page", { autonomous: true });
    expect(inv?.args).toContain("--dangerously-skip-permissions");
    expect(inv?.args).not.toContain("acceptEdits");
    expect(inv?.args.at(-1)).toBe("build a landing page");
  });

  it("forwards the credential as `-e NAME` (value NEVER in argv) + mounts the project rw", () => {
    const r = autonomousInvocation("claude", "build the landing page", undefined, "/proj");
    expect("inv" in r).toBe(true);
    if (!("inv" in r)) return;
    expect(r.inv.cmd).toBe("docker");
    expect(r.inv.args).toContain("/proj:/work:rw");
    expect(r.inv.args).toContain("-e");
    expect(r.inv.args).toContain("ANTHROPIC_API_KEY"); // name forwarded
    expect(r.inv.args).not.toContain("sk-test-box");   // the SECRET VALUE is never in argv
    expect(r.inv.args).toContain("--dangerously-skip-permissions");
    expect(r.cred).toEqual({ name: "ANTHROPIC_API_KEY", value: "sk-test-box" });
    expect(r.plan.dryRun).toBe(false);
  });

  it("flags a destructive task for a read-only dry-run (mount-scope policy)", () => {
    const r = autonomousInvocation("claude", "clean out the build artifacts", undefined, "/proj");
    expect("inv" in r).toBe(true);
    if (!("inv" in r)) return;
    expect(r.plan.dryRun).toBe(true);
    expect(r.plan.summary).toMatch(/dry-run/i);
  });

  it("refuses autonomous mode for a non-claude agent (only claude is wired)", () => {
    const r = autonomousInvocation("codex", "do it", undefined, "/proj");
    expect("error" in r).toBe(true);
    if ("error" in r) expect(r.error).toMatch(/claude only/i);
  });
});
