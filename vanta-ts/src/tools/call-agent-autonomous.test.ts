import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { autonomousInvocation } from "./call-agent.js";
import { buildAgentInvocation } from "../agents/external-cli.js";

describe("call_agent autonomous — claude boxed in a mount-scoped container", () => {
  it("builds claude with --dangerously-skip-permissions (autonomous flag)", () => {
    const inv = buildAgentInvocation("claude", "build a landing page", { autonomous: true });
    expect(inv?.args).toContain("--dangerously-skip-permissions");
    expect(inv?.args).not.toContain("acceptEdits");
    expect(inv?.args.at(-1)).toBe("build a landing page");
  });

  it("wraps a build task in docker scoped to the project (rw) + ~/.claude auth (ro), no dry-run", () => {
    const r = autonomousInvocation("claude", "build the landing page", undefined, "/proj");
    expect("inv" in r).toBe(true);
    if (!("inv" in r)) return;
    expect(r.inv.cmd).toBe("docker");
    // a build → project mounted rw at /work, auth mounted ro
    expect(r.inv.args).toContain("/proj:/work:rw");
    expect(r.inv.args).toContain(`${homedir()}/.claude:/root/.claude:ro`);
    expect(r.inv.args).toContain("claude");
    expect(r.inv.args).toContain("--dangerously-skip-permissions");
    expect(r.mounts.find((m) => m.mode === "rw")?.host).toBe("/proj");
    expect(r.plan.dryRun).toBe(false);
  });

  it("flags a destructive task for a dry-run (mount-scope policy)", () => {
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
