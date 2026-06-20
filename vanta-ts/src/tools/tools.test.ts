import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRegistry } from "./index.js";
import { readFileTool } from "./read-file.js";
import { writeFileTool } from "./write-file.js";
import { shellCmdTool, classifyExitCode, lastCommandWord, shellSandboxEnv } from "./shell-cmd.js";
import { configSandboxTool, buildScopedRegistry } from "./config-sandbox.js";
import type { ToolContext } from "./types.js";

let root: string;

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    root,
    safety: {} as ToolContext["safety"],
    requestApproval: async () => true,
    ...overrides,
  };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-test-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("registry", () => {
  it("registers all tools", () => {
    const r = buildRegistry();
    const names = r.schemas().map((s) => s.name).sort();
    expect(names).toEqual([
      "bg_list",
      "bg_status",
      "brain",
      "brief",
      "browser_act",
      "browser_extract",
      "browser_navigate",
      "browser_read",
      "budget",
      "calendar_create",
      "calendar_read",
      "calendar_update",
      "clarify",
      "code_affected",
      "code_context",
      "code_index",
      "code_search",
      "compare_vision",
      "compose_workflow",
      "config",
      "config_sandbox",
      "cookie_import",
      "cron_create",
      "cron_list",
      "delegate",
      "describe_image",
      "drive_create",
      "drive_read",
      "drive_update",
      "edit_file",
      "git_branch",
      "git_checkout",
      "git_commit",
      "git_diff",
      "git_push",
      "git_status",
      "github_read",
      "glob_files",
      "gmail_draft",
      "gmail_read",
      "gmail_search",
      "gmail_send",
      "graph_query",
      "grep_files",
      "inspect_state",
      "lan_control",
      "lan_discover",
      "life_search",
      "linkedin_read",
      "list_mcp_resources",
      "look_at_camera",
      "look_at_screen",
      "loop",
      "lsp_definition",
      "lsp_diagnostics",
      "mcp_auth",
      "money",
      "mount_mcp",
      "nl_assertions",
      "playbook",
      "podcast_read",
      "protect",
      "radar",
      "reach",
      "read_file",
      "read_mcp_resource",
      "recall",
      "reddit_read",
      "ref_ingest",
      "ref_list",
      "ref_search",
      "regression_lock",
      "retrieve_original",
      "roadmap_add",
      "roadmap_move",
      "rss_read",
      "run_code",
      "screenshot",
      "self_correct",
      "self_repair",
      "send_message",
      "shell_cmd",
      "sleep",
      "speak",
      "swarm",
      "taste_critique",
      "team",
      "todo",
      "tool_search",
      "transcribe",
      "twitter_read",
      "watch_video",
      "web_fetch",
      "web_search",
      "world",
      "write_file",
      "write_skill",
      "youtube_read",
    ]);
  });

  it("excludes named tools when given an exclude list", () => {
    const r = buildRegistry({ exclude: ["delegate"] });
    const names = r.schemas().map((s) => s.name);
    expect(names).not.toContain("delegate");
  });
});

describe("read_file", () => {
  it("reads a file inside scope", async () => {
    await writeFile(join(root, "hello.txt"), "world");
    const res = await readFileTool.execute({ path: "hello.txt" }, ctx());
    expect(res.ok).toBe(true);
    expect(res.output).toBe("world");
  });

  it("reads a file from a configured readable zone outside the project", async () => {
    const zone = await mkdtemp(join(tmpdir(), "vanta-rzone-"));
    const prev = process.env.VANTA_READABLE_DIRS;
    process.env.VANTA_READABLE_DIRS = zone;
    try {
      const target = join(zone, "skill.md");
      await writeFile(target, "# Sibling skill");
      const res = await readFileTool.execute({ path: target }, ctx());
      expect(res.ok).toBe(true);
      expect(res.output).toBe("# Sibling skill");
    } finally {
      if (prev === undefined) delete process.env.VANTA_READABLE_DIRS;
      else process.env.VANTA_READABLE_DIRS = prev;
      await rm(zone, { recursive: true, force: true });
    }
  });

  it("refuses an out-of-zone path when the user denies the scope ask", async () => {
    const prev = process.env.VANTA_READABLE_DIRS;
    process.env.VANTA_READABLE_DIRS = "/some/allowed/zone";
    try {
      // A path that is out-of-zone but NOT on the dangerous blocklist.
      const res = await readFileTool.execute(
        { path: "/var/lib/elsewhere/x.txt" },
        ctx({ requestApproval: async () => false }),
      );
      expect(res.ok).toBe(false);
      expect(res.output).toContain("not in a readable zone");
    } finally {
      if (prev === undefined) delete process.env.VANTA_READABLE_DIRS;
      else process.env.VANTA_READABLE_DIRS = prev;
    }
  });

  it("reads an out-of-zone path when the user approves the scope ask (adds session dir)", async () => {
    const zone = await mkdtemp(join(tmpdir(), "vanta-askzone-"));
    const prevR = process.env.VANTA_READABLE_DIRS;
    const prevE = process.env.VANTA_EXTRA_DIRS;
    process.env.VANTA_READABLE_DIRS = "/some/allowed/zone";
    delete process.env.VANTA_EXTRA_DIRS;
    try {
      const target = join(zone, "approved.txt");
      await writeFile(target, "let in");
      const res = await readFileTool.execute({ path: target }, ctx({ requestApproval: async () => true }));
      expect(res.ok).toBe(true);
      expect(res.output).toBe("let in");
      expect(process.env.VANTA_EXTRA_DIRS).toContain(zone);
    } finally {
      if (prevR === undefined) delete process.env.VANTA_READABLE_DIRS;
      else process.env.VANTA_READABLE_DIRS = prevR;
      if (prevE === undefined) delete process.env.VANTA_EXTRA_DIRS;
      else process.env.VANTA_EXTRA_DIRS = prevE;
      await rm(zone, { recursive: true, force: true });
    }
  });
});

describe("write_file", () => {
  it("writes a new file without approval", async () => {
    const res = await writeFileTool.execute(
      { path: "new.txt", content: "data" },
      ctx(),
    );
    expect(res.ok).toBe(true);
    expect(await readFile(join(root, "new.txt"), "utf8")).toBe("data");
  });

  it("ACTION-PROOF: reports a re-read verification readout after writing", async () => {
    const res = await writeFileTool.execute(
      { path: "proof.txt", content: "line1\nline2\nline3" },
      ctx(),
    );
    expect(res.ok).toBe(true);
    expect(res.output).toContain("verified");
    expect(res.output).toContain("bytes on disk");
  });

  it("CODE-SIZE-GATE in-loop: flags an oversized TS write in the tool result (still writes)", async () => {
    const tooLong = `function f(a:number,b:number,c:number,d:number,e:number){return a+b+c+d+e;}\n`;
    const res = await writeFileTool.execute({ path: "big.ts", content: tooLong }, ctx());
    expect(res.ok).toBe(true); // the write still succeeds
    expect(res.output).toContain("size gate");
    expect(res.output).toContain("params");
  });

  it("CODE-SIZE-GATE in-loop: a clean TS write gets no size note; non-TS is exempt", async () => {
    const clean = await writeFileTool.execute({ path: "ok.ts", content: "export const x = 1;\n" }, ctx());
    expect(clean.output).not.toContain("size gate");
    const txt = await writeFileTool.execute({ path: "notes.txt", content: "a".repeat(5000) }, ctx());
    expect(txt.output).not.toContain("size gate");
  });

  it("requires approval to overwrite, and respects denial", async () => {
    await writeFile(join(root, "exists.txt"), "original");
    const res = await writeFileTool.execute(
      { path: "exists.txt", content: "changed" },
      ctx({ requestApproval: async () => false }),
    );
    expect(res.ok).toBe(false);
    expect(await readFile(join(root, "exists.txt"), "utf8")).toBe("original");
  });

  it("overwrites when approved", async () => {
    await writeFile(join(root, "exists.txt"), "original");
    const res = await writeFileTool.execute(
      { path: "exists.txt", content: "changed" },
      ctx({ requestApproval: async () => true }),
    );
    expect(res.ok).toBe(true);
    expect(await readFile(join(root, "exists.txt"), "utf8")).toBe("changed");
  });

  it("writes outside the project into a configured writable zone", async () => {
    const zone = await mkdtemp(join(tmpdir(), "vanta-zone-"));
    const prev = process.env.VANTA_WRITABLE_DIRS;
    process.env.VANTA_WRITABLE_DIRS = zone;
    try {
      const target = join(zone, "report.html");
      const res = await writeFileTool.execute({ path: target, content: "<h1>hi</h1>" }, ctx());
      expect(res.ok).toBe(true);
      expect(await readFile(target, "utf8")).toBe("<h1>hi</h1>");
    } finally {
      if (prev === undefined) delete process.env.VANTA_WRITABLE_DIRS;
      else process.env.VANTA_WRITABLE_DIRS = prev;
      await rm(zone, { recursive: true, force: true });
    }
  });

  it("refuses an out-of-zone path when the user denies the scope ask", async () => {
    const outside = await mkdtemp(join(tmpdir(), "vanta-outside-"));
    const prev = process.env.VANTA_WRITABLE_DIRS;
    process.env.VANTA_WRITABLE_DIRS = "/some/allowed/zone";
    try {
      const res = await writeFileTool.execute(
        { path: join(outside, "x.txt"), content: "nope" },
        ctx({ requestApproval: async () => false }),
      );
      expect(res.ok).toBe(false);
      expect(res.output).toContain("not in a writable zone");
    } finally {
      if (prev === undefined) delete process.env.VANTA_WRITABLE_DIRS;
      else process.env.VANTA_WRITABLE_DIRS = prev;
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe("shell_cmd", () => {
  it("runs a command and returns output", async () => {
    const res = await shellCmdTool.execute({ command: "echo hi" }, ctx());
    expect(res.ok).toBe(true);
    expect(res.output).toContain("hi");
  });

  it("refuses a destructive command locally", async () => {
    const res = await shellCmdTool.execute({ command: "rm -rf /" }, ctx());
    expect(res.ok).toBe(false);
    expect(res.output).toContain("destructive");
  });

  it("reports grep no-match (exit 1) as success, not failure", async () => {
    const res = await shellCmdTool.execute({ command: "grep needle /dev/null" }, ctx());
    expect(res.ok).toBe(true);
    expect(res.output).toContain("No matches found");
  });

  it("still fails a real non-zero command", async () => {
    const res = await shellCmdTool.execute({ command: "ls /no/such/path/xyz" }, ctx());
    expect(res.ok).toBe(false);
  });

  it("prepends a destructive-command warning to the result", async () => {
    // Runs in a temp non-repo dir → git errors harmlessly; the ⚠ note is still surfaced.
    const res = await shellCmdTool.execute({ command: "git reset --hard" }, ctx());
    expect(res.output).toContain("discards uncommitted");
  });

  it("maps VANTA_SHELL_SANDBOX to the OS sandbox flag for shell_cmd only", () => {
    const env = shellSandboxEnv({ VANTA_SHELL_SANDBOX: "1" });
    expect(env.VANTA_SANDBOX).toBe("1");
  });
});

describe("dangerous-path floor", () => {
  it("write_file refuses a protected credential path even with auto-approval", async () => {
    // ctx() approves everything; the dangerous floor runs BEFORE approval.
    const res = await writeFileTool.execute({ path: "~/.ssh/id_rsa", content: "x" }, ctx());
    expect(res.ok).toBe(false);
    expect(res.output).toContain("never writable");
  });
  it("read_file refuses /etc/passwd as protected, not merely out-of-zone", async () => {
    const res = await readFileTool.execute({ path: "/etc/passwd" }, ctx());
    expect(res.ok).toBe(false);
    expect(res.output).toContain("never accessible");
  });
});

describe("classifyExitCode", () => {
  it("treats grep/rg exit 1 as 'No matches found'", () => {
    expect(classifyExitCode("grep foo bar.txt", 1)).toEqual({ ok: true, note: "No matches found" });
    expect(classifyExitCode("rg foo", 1)).toEqual({ ok: true, note: "No matches found" });
  });
  it("treats diff exit 1 as 'Differences found'", () => {
    expect(classifyExitCode("diff a b", 1)).toEqual({ ok: true, note: "Differences found" });
  });
  it("treats find exit 1 as a partial-access outcome", () => {
    expect(classifyExitCode("find . -name x", 1)).toEqual({ ok: true, note: "Some paths were inaccessible" });
  });
  it("keeps grep exit 2 (real error) an error", () => {
    expect(classifyExitCode("grep foo bar", 2).ok).toBe(false);
  });
  it("keeps unrelated commands' non-zero exits errors", () => {
    expect(classifyExitCode("ls /nope", 1).ok).toBe(false);
  });
  it("classifies by the LAST command in a pipeline/chain", () => {
    expect(classifyExitCode("cat x | grep y", 1).ok).toBe(true);
    expect(classifyExitCode("grep y file && echo done", 1).ok).toBe(false); // last = echo
  });
  it("handles git grep / git diff and path-qualified binaries", () => {
    expect(classifyExitCode("git grep foo", 1).ok).toBe(true);
    expect(classifyExitCode("git diff --quiet", 1)).toEqual({ ok: true, note: "Differences found" });
    expect(classifyExitCode("/usr/bin/grep -n x f", 1).ok).toBe(true);
  });
});

describe("lastCommandWord", () => {
  it("takes the last pipeline segment's program basename", () => {
    expect(lastCommandWord("grep x f")).toBe("grep");
    expect(lastCommandWord("cat x | grep y")).toBe("grep");
    expect(lastCommandWord("find . && echo hi")).toBe("echo");
    expect(lastCommandWord("git grep foo")).toBe("git grep");
    expect(lastCommandWord("/usr/bin/grep -n x")).toBe("grep");
  });
});

describe("config_sandbox", () => {
  // The `run` action exercises the real spawnSubagent runner (LLM/network); that
  // path is unit-tested with an INJECTED fake runner in selfharness/sandbox.test.ts.
  // Here we cover the tool surface that needs no network.
  it("saves a reusable input to .vanta/sandbox/inputs/ (no git mutation)", async () => {
    const res = await configSandboxTool.execute(
      { action: "save", name: "fix-bug", instruction: "fix the failing test" },
      ctx(),
    );
    expect(res.ok).toBe(true);
    expect(res.output).toContain('Saved sandbox input "fix-bug"');
    const saved = await readFile(join(root, ".vanta", "sandbox", "inputs", "fix-bug.json"), "utf8");
    expect(JSON.parse(saved)).toMatchObject({ name: "fix-bug", instruction: "fix the failing test" });
  });

  it("describeForSafety is a constant internal-op string (kernel Allow)", () => {
    expect(configSandboxTool.describeForSafety?.({ action: "run", name: "x" })).toBe("run config sandbox (isolated, no git)");
  });

  it("errors-as-values when the saved input is missing (never throws)", async () => {
    const res = await configSandboxTool.execute({ action: "run", name: "never-saved" }, ctx());
    expect(res.ok).toBe(false);
    expect(res.output).toContain("no saved sandbox input");
  });

  it("restricts tools when override.toolNames is set (scoped registry)", () => {
    const scoped = buildScopedRegistry(["read_file", "shell_cmd"]);
    expect(scoped.schemas().map((s) => s.name).sort()).toEqual(["read_file", "shell_cmd"]);
    // No subset → the full registry.
    expect(buildScopedRegistry().schemas().length).toBeGreaterThan(2);
  });
});
