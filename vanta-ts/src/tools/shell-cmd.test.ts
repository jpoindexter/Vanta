import { describe, it, expect, vi, afterEach } from "vitest";
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

  it("does NOT flag benign /dev/null redirects as destructive", async () => {
    // Regression: `>\s*/dev/` used to block the ubiquitous `2>/dev/null`.
    for (const command of [
      'test -d "$HOME/x" 2>/dev/null && echo found',
      "ls > /dev/null 2>&1",
      "dd if=seed of=/dev/null",
    ]) {
      const r = await shellCmdTool.execute({ command }, ctx());
      expect(r.output, command).not.toMatch(/destructive/);
    }
  });

  it("still blocks writes to real device nodes", async () => {
    for (const command of ["echo x > /dev/sda", "dd if=z of=/dev/disk0", "cat a > /dev/nvme0n1"]) {
      const r = await shellCmdTool.execute({ command }, ctx());
      expect(r.ok, command).toBe(false);
      expect(r.output, command).toMatch(/destructive/);
    }
  });
});

describe("shell_cmd plugin hints (strip from stderr + surface suggestion)", () => {
  it("strips a vanta-hint tag from captured stderr and appends an install suggestion", async () => {
    const cmd =
      'echo work-output; printf \'<vanta-hint type="plugin" name="pylsp" marketplace="agent-skills" />\' 1>&2';
    const r = await shellCmdTool.execute({ command: cmd }, ctx());
    expect(r.ok).toBe(true);
    expect(r.output).toContain("work-output");
    expect(r.output).not.toContain("vanta-hint");
    expect(r.output).toContain("Install pylsp plugin? (from agent-skills)");
  });

  it("leaves output unchanged when no hint tag is present", async () => {
    const r = await shellCmdTool.execute({ command: "echo just-plain; echo also-stderr 1>&2" }, ctx());
    expect(r.ok).toBe(true);
    expect(r.output).toContain("just-plain");
    expect(r.output).toContain("also-stderr");
    expect(r.output).not.toMatch(/Install .* plugin\?/);
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

describe("shell_cmd VANTA_SSH_SESSION (session-wide remote routing)", () => {
  afterEach(() => { delete process.env.VANTA_SSH_SESSION; });

  it("describeForSafety routes to the session host when no explicit ssh arg is given", () => {
    process.env.VANTA_SSH_SESSION = "deploy@host";
    expect(shellCmdTool.describeForSafety?.({ command: "ls" })).toMatch(/ssh "deploy@host".*ls/);
  });

  it("refuses background tasks in an ssh session (proves the session activates the remote branch)", async () => {
    process.env.VANTA_SSH_SESSION = "deploy@host";
    const r = await shellCmdTool.execute({ command: "uptime", background: true }, ctx());
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/background tasks are not supported over ssh/);
  });

  it("an explicit ssh arg overrides the session host", () => {
    process.env.VANTA_SSH_SESSION = "deploy@host";
    expect(shellCmdTool.describeForSafety?.({ command: "ls", ssh: "other@box" })).toMatch(/ssh "other@box".*ls/);
  });
});
