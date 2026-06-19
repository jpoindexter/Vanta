import { describe, it, expect, vi } from "vitest";
import { shellCmdTool } from "./shell-cmd.js";
import type { ToolContext } from "./types.js";

function ctx(root = "/tmp"): ToolContext {
  return { root, safety: {} as ToolContext["safety"], requestApproval: vi.fn(async () => true) };
}

describe("shell_cmd local execution", () => {
  it("runs a command locally and returns its output", async () => {
    const r = await shellCmdTool.execute({ command: "echo hello-vanta" }, ctx());
    expect(r.ok).toBe(true);
    expect(r.output).toContain("hello-vanta");
  });

  it("blocks destructive patterns before running", async () => {
    const r = await shellCmdTool.execute({ command: "rm -rf /" }, ctx());
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/destructive/);
  });
});

describe("shell_cmd ssh routing", () => {
  it("refuses background tasks over ssh", async () => {
    const r = await shellCmdTool.execute({ command: "uptime", ssh: "vps", background: true }, ctx());
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/background tasks are not supported over ssh/);
  });

  it("returns ok:false for an unknown ssh profile", async () => {
    const r = await shellCmdTool.execute({ command: "uptime", ssh: "definitely-not-a-real-profile-xyz" }, ctx());
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/unknown ssh profile/);
  });

  it("describeForSafety surfaces the ssh host so the kernel assesses the remote command", () => {
    expect(shellCmdTool.describeForSafety?.({ command: "rm x", ssh: "vps" })).toMatch(/ssh "vps".*rm x/);
    expect(shellCmdTool.describeForSafety?.({ command: "ls" })).toBe("run shell command: ls");
  });
});
