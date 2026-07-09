import { describe, it, expect, vi, afterEach } from "vitest";
import { shellCmdTool, sandboxServeRefusal } from "./shell-cmd.js";
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

// SANDBOX-SERVE-FASTFAIL: a listening server has no working path under the sandbox
// (background isn't sandboxed, a foreground bind EPERMs). Fail fast with the one fix
// instead of letting the agent burn the background↔foreground refusal ping-pong.
describe("shell_cmd SANDBOX-SERVE-FASTFAIL", () => {
  const prevSandbox = process.env.VANTA_SHELL_SANDBOX;
  afterEach(() => {
    if (prevSandbox === undefined) delete process.env.VANTA_SHELL_SANDBOX;
    else process.env.VANTA_SHELL_SANDBOX = prevSandbox;
  });

  it("sandboxServeRefusal: refuses a serve intent under an active sandbox, naming the fix", () => {
    process.env.VANTA_SHELL_SANDBOX = "1";
    const r = sandboxServeRefusal("python3 -m http.server 8123");
    expect(r?.ok).toBe(false);
    expect(r?.output).toMatch(/no working path under the shell sandbox/);
    expect(r?.output).toMatch(/VANTA_SHELL_SANDBOX=0/);
    expect(r?.output).toMatch(/background:true/);
  });

  it("sandboxServeRefusal: null when the sandbox is off (server still runs the normal path)", () => {
    process.env.VANTA_SHELL_SANDBOX = "0";
    expect(sandboxServeRefusal("npx serve -s build")).toBeNull();
  });

  it("sandboxServeRefusal: null for a non-serve command even under sandbox", () => {
    process.env.VANTA_SHELL_SANDBOX = "1";
    expect(sandboxServeRefusal("npm run build")).toBeNull();
  });

  it("execute: fast-fails a serve with background:true under sandbox (pre-empts the bg-sandbox refusal)", async () => {
    process.env.VANTA_SHELL_SANDBOX = "1";
    const r = await shellCmdTool.execute({ command: "python3 -m http.server 8123", background: true }, ctx());
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/no working path under the shell sandbox/);
    expect(r.output).toMatch(/Recovery:/);
    expect(r.output).not.toMatch(/run without background=true/); // NOT the generic bg-sandbox branch
  });

  it("execute: fast-fails a Tauri dev command with background:true under sandbox", async () => {
    process.env.VANTA_SHELL_SANDBOX = "1";
    const r = await shellCmdTool.execute({
      command: "cd /Users/jasonpoindexter/Documents/GitHub/whisperflow-local-clone/Handy && CMAKE_POLICY_VERSION_MINIMUM=3.5 bun run tauri dev",
      background: true,
    }, ctx());
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/no working path under the shell sandbox/);
    expect(r.output).toMatch(/VANTA_SHELL_SANDBOX=0/);
    expect(r.output).toMatch(/background:true/);
    expect(r.output).not.toMatch(/run without background=true/);
  });

  it("execute: fast-fails a foreground serve under sandbox (pre-empts the needs-background steer)", async () => {
    process.env.VANTA_SHELL_SANDBOX = "1";
    const r = await shellCmdTool.execute({ command: "npx serve -s build" }, ctx());
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/VANTA_SHELL_SANDBOX=0/);
    expect(r.output).not.toMatch(/is long-running or backgrounded/); // NOT the wedge-steer branch
  });

  it("execute: sandbox OFF — a foreground serve still gets the background steer, not the serve fast-fail", async () => {
    process.env.VANTA_SHELL_SANDBOX = "0";
    const r = await shellCmdTool.execute({ command: "python3 -m http.server 8123" }, ctx());
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/is long-running or backgrounded/);
    expect(r.output).not.toMatch(/no working path/);
  });

  it("execute: generic sandboxed background refusal includes recovery steps", async () => {
    process.env.VANTA_SHELL_SANDBOX = "1";
    const r = await shellCmdTool.execute({ command: "sleep 10", background: true }, ctx("/tmp/vanta-root"));
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/background tasks are not sandboxed/);
    expect(r.output).toMatch(/Recovery:/);
    expect(r.output).toContain("cd '/tmp/vanta-root' && VANTA_SHELL_SANDBOX=0 vanta");
    expect(r.output).toMatch(/background:true/);
  });
});
