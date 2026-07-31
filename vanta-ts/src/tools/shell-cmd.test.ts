import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shellCmdTool, sandboxServeRefusal } from "./shell-cmd.js";
import { readBgTask } from "./bg-tasks.js";
import { formatRunFailure, formatRunSuccess } from "./shell-output.js";
import type { ToolContext } from "./types.js";

function ctx(root = tmpdir()): ToolContext {
  return {
    root,
    sessionId: `shell-test:${root}`,
    safety: { assess: async () => ({ risk: "allow", reason: "test" }) } as unknown as ToolContext["safety"],
    requestApproval: vi.fn(async () => true),
  };
}

describe("shell_cmd local execution", () => {
  it("runs a command locally and returns its output", async () => {
    const r = await shellCmdTool.execute({ command: "echo hello-vanta" }, ctx());
    expect(r.ok).toBe(true);
    expect(r.output).toContain("hello-vanta");
  });

  it("does not expose provider credentials inherited by the Vanta process", async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "should-never-reach-shell";
    try {
      const r = await shellCmdTool.execute({ command: 'printf "${OPENAI_API_KEY-unset}"' }, ctx());
      expect(r.ok).toBe(true);
      expect(r.output).toContain("unset");
      expect(r.output).not.toContain("should-never-reach-shell");
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
  });

  it.runIf(process.platform === "darwin")("cannot read project .env through the default sandbox", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-shell-secret-"));
    const previous = process.env.VANTA_SHELL_SANDBOX;
    try {
      process.env.VANTA_SHELL_SANDBOX = "1";
      await writeFile(join(root, ".env"), "PROJECT_SECRET=should-never-reach-shell\n", "utf8");
      const r = await shellCmdTool.execute({ command: "cat .env" }, ctx(root));
      expect(r.output).not.toContain("should-never-reach-shell");
      expect(r.ok).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.VANTA_SHELL_SANDBOX;
      else process.env.VANTA_SHELL_SANDBOX = previous;
      await rm(root, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform === "darwin")("cannot overwrite project .env through the default sandbox", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-shell-secret-write-"));
    const previous = process.env.VANTA_SHELL_SANDBOX;
    const envPath = join(root, ".env");
    try {
      process.env.VANTA_SHELL_SANDBOX = "1";
      await writeFile(envPath, "PROJECT_SECRET=original\n", "utf8");
      const r = await shellCmdTool.execute({ command: "printf hacked > .env" }, ctx(root));
      expect(r.ok).toBe(false);
      expect(await readFile(envPath, "utf8")).toBe("PROJECT_SECRET=original\n");
    } finally {
      if (previous === undefined) delete process.env.VANTA_SHELL_SANDBOX;
      else process.env.VANTA_SHELL_SANDBOX = previous;
      await rm(root, { recursive: true, force: true });
    }
  });

  it("marks mdfind's zero-exit fatal query diagnostic as a failure", () => {
    const result = formatRunSuccess(
      `mdfind 'kMDItemKind == "Mail Message" && (application || recruiter)'`,
      `Failed to create query for 'kMDItemKind == "Mail Message" && (application || recruiter)'.`,
      "",
    );
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Failed to create query");
  });

  it.runIf(process.platform === "darwin")("marks the real malformed mdfind invocation as failed", async () => {
    const result = await shellCmdTool.execute({
      command: `mdfind 'kMDItemKind == "Mail Message" && (application || recruiter)'`,
    }, ctx());
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Failed to create query");
  });

  it("does not mistake normal mdfind diagnostics or an empty result for failure", () => {
    expect(formatRunSuccess(
      "mdfind 'application recruiter'",
      `[UserQueryParser] Loading keywords and predicates for locale "en"`,
      "",
    ).ok).toBe(true);
    expect(formatRunSuccess("mdfind 'no matches'", "", "").ok).toBe(true);
  });

  it("reports timeout termination explicitly with a bounded recovery path", () => {
    const result = formatRunFailure("python3 scan.py", {
      message: "Command failed: sandbox-exec ...",
      killed: true,
      signal: "SIGTERM",
    }, "");
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/timed out/i);
    expect(result.output).toContain("timeout_ms");
    expect(result.output).toContain("120000");
  });

  it("accepts a bounded timeout override and enforces its upper limit", async () => {
    const completed = await shellCmdTool.execute({
      command: "sleep 0.15; echo bounded-timeout-complete",
      timeout_ms: 2_000,
    }, ctx());
    expect(completed.ok).toBe(true);
    expect(completed.output).toContain("bounded-timeout-complete");

    const invalid = await shellCmdTool.execute({
      command: "echo should-not-run",
      timeout_ms: 120_001,
    }, ctx());
    expect(invalid.ok).toBe(false);
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
  const prevNet = process.env.VANTA_SANDBOX_NET;
  afterEach(() => {
    if (prevSandbox === undefined) delete process.env.VANTA_SHELL_SANDBOX;
    else process.env.VANTA_SHELL_SANDBOX = prevSandbox;
    if (prevNet === undefined) delete process.env.VANTA_SANDBOX_NET;
    else process.env.VANTA_SANDBOX_NET = prevNet;
  });

  it("sandboxServeRefusal: allows serving when the auto sandbox already permits network", () => {
    expect(sandboxServeRefusal(
      "python3 -m http.server 8123",
      "/tmp/vanta-root",
      {},
      "darwin",
      false,
    )).toBeNull();
  });

  it("sandboxServeRefusal: refuses a serve intent when sandbox network is explicitly disabled", () => {
    process.env.VANTA_SHELL_SANDBOX = "1";
    const r = sandboxServeRefusal("python3 -m http.server 8123");
    expect(r?.ok).toBe(false);
    expect(r?.output).toMatch(/network is disabled/);
    expect(r?.output).toMatch(/VANTA_SANDBOX_NET=1/);
    expect(r?.output).not.toMatch(/VANTA_SHELL_SANDBOX=0/);
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

  it("execute: fast-fails a serve with background:true when sandbox network is disabled", async () => {
    process.env.VANTA_SHELL_SANDBOX = "1";
    const r = await shellCmdTool.execute({ command: "python3 -m http.server 8123", background: true }, ctx());
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/network is disabled/);
    expect(r.output).toMatch(/Recovery:/);
    expect(r.output).not.toMatch(/VANTA_SHELL_SANDBOX=0/);
  });

  it("execute: fast-fails a Tauri dev command with background:true under sandbox", async () => {
    process.env.VANTA_SHELL_SANDBOX = "1";
    const r = await shellCmdTool.execute({
      command: "cd /Users/jasonpoindexter/Documents/GitHub/whisperflow-local-clone/Handy && CMAKE_POLICY_VERSION_MINIMUM=3.5 bun run tauri dev",
      background: true,
    }, ctx());
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/network is disabled/);
    expect(r.output).toMatch(/VANTA_SANDBOX_NET=1/);
    expect(r.output).toMatch(/background:true/);
  });

  it("execute: fast-fails a foreground serve under sandbox (pre-empts the needs-background steer)", async () => {
    process.env.VANTA_SHELL_SANDBOX = "1";
    const r = await shellCmdTool.execute({ command: "npx serve -s build" }, ctx());
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/VANTA_SANDBOX_NET=1/);
    expect(r.output).not.toMatch(/is long-running or backgrounded/); // NOT the wedge-steer branch
  });

  it("execute: sandbox OFF — a foreground serve still gets the background steer, not the serve fast-fail", async () => {
    process.env.VANTA_SHELL_SANDBOX = "0";
    const r = await shellCmdTool.execute({ command: "python3 -m http.server 8123" }, ctx());
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/is long-running or backgrounded/);
    expect(r.output).not.toMatch(/no working path/);
  });

  it.runIf(process.platform === "darwin")("execute: starts and reaches a loopback preview server under the default sandbox", async () => {
    delete process.env.VANTA_SHELL_SANDBOX;
    delete process.env.VANTA_SANDBOX_NET;
    const root = await mkdtemp(join(tmpdir(), "vanta-shell-serve-"));
    const port = await availablePort();
    const dataDir = join(root, ".vanta");
    try {
      const command = `python3 -m http.server ${port} --bind 127.0.0.1 >/dev/null 2>&1 & server=$!; sleep 1.5; kill "$server"; wait "$server" 2>/dev/null || true`;
      const result = await shellCmdTool.execute({ command, background: true }, ctx(root));
      expect(result.ok).toBe(true);
      const id = /background task started: (bg-[^\s]+)/.exec(result.output)?.[1];
      expect(id).toBeTruthy();
      await waitForHttp(`http://127.0.0.1:${port}`);
      expect((await readBgTask(dataDir, id!))?.status).toBe("running");
      expect((await waitForBgDone(dataDir, id!))?.status).toBe("done");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function waitForHttp(url: string): Promise<void> {
  const deadline = Date.now() + 2_500;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`preview server did not become reachable: ${url}`);
}

async function waitForBgDone(dataDir: string, id: string) {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    const task = await readBgTask(dataDir, id);
    if (task && task.status !== "running") return task;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`background task did not finish: ${id}`);
}
