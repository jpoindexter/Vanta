import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadShellHooks,
  matchingHooks,
  runShellHook,
  firePreToolUse,
  fireHooks,
  fireStopHook,
  SHELL_HOOK_EVENTS,
  shellHooksPath,
} from "./shell-hooks.js";

async function writeHooks(dir: string, config: unknown): Promise<void> {
  await writeFile(shellHooksPath(dir), JSON.stringify(config), "utf8");
}

describe("loadShellHooks", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "vanta-hooks-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("returns {} when no hooks.json exists", async () => {
    expect(await loadShellHooks(dir)).toEqual({});
  });

  it("returns {} on malformed json", async () => {
    await writeFile(shellHooksPath(dir), "{not json", "utf8");
    expect(await loadShellHooks(dir)).toEqual({});
  });

  it("parses a valid config", async () => {
    await writeHooks(dir, { PreToolUse: [{ matcher: "write_file", command: "exit 1" }] });
    const c = await loadShellHooks(dir);
    expect(c.PreToolUse).toHaveLength(1);
    expect(c.PreToolUse?.[0]?.command).toBe("exit 1");
  });

  it("rejects a hook with no command and no mcp_tool type (zod) → {}", async () => {
    await writeHooks(dir, { PreToolUse: [{ matcher: "x" }] });
    expect(await loadShellHooks(dir)).toEqual({});
  });

  it("parses an mcp_tool hook without a command field", async () => {
    await writeHooks(dir, { PostToolUse: [{ type: "mcp_tool", server: "notify", tool: "send_notification" }] });
    const c = await loadShellHooks(dir);
    expect(c.PostToolUse).toHaveLength(1);
    expect(c.PostToolUse?.[0]?.type).toBe("mcp_tool");
    expect(c.PostToolUse?.[0]?.server).toBe("notify");
    expect(c.PostToolUse?.[0]?.tool).toBe("send_notification");
  });

  it("accepts the full hook event vocabulary", async () => {
    const config = Object.fromEntries(SHELL_HOOK_EVENTS.map((event) => [event, [{ command: "true" }]]));
    await writeHooks(dir, config);
    const loaded = await loadShellHooks(dir);
    expect(SHELL_HOOK_EVENTS).toHaveLength(30);
    for (const event of SHELL_HOOK_EVENTS) expect(loaded[event]).toHaveLength(1);
  });

  it("rejects an mcp_tool hook with missing server (zod) → {}", async () => {
    await writeHooks(dir, { PostToolUse: [{ type: "mcp_tool", tool: "t" }] });
    expect(await loadShellHooks(dir)).toEqual({});
  });
});

describe("matchingHooks", () => {
  const cfg = {
    PreToolUse: [
      { matcher: "write_file", command: "a" },
      { matcher: "^read", command: "b" },
      { command: "c" }, // no matcher → always matches
    ],
  };

  it("matches by regex on the tool name (legacy matcher field)", () => {
    expect(matchingHooks(cfg, "PreToolUse", { toolName: "write_file" }).map((h) => h.command)).toEqual(["a", "c"]);
  });

  it("matches read_file via ^read + the no-matcher hook", () => {
    expect(matchingHooks(cfg, "PreToolUse", { toolName: "read_file" }).map((h) => h.command)).toEqual(["b", "c"]);
  });

  it("returns all hooks when no tool name is given (non-tool events)", () => {
    expect(matchingHooks(cfg, "PreToolUse", {})).toHaveLength(3);
  });

  it("is empty for an event with no hooks", () => {
    expect(matchingHooks(cfg, "Stop")).toEqual([]);
  });

  it("toolNamePattern takes precedence over matcher as the explicit name", () => {
    const c = { PreToolUse: [{ toolNamePattern: "shell_cmd", command: "x" }] };
    expect(matchingHooks(c, "PreToolUse", { toolName: "shell_cmd" }).map((h) => h.command)).toEqual(["x"]);
    expect(matchingHooks(c, "PreToolUse", { toolName: "write_file" })).toHaveLength(0);
  });

  it("inputPattern filters by tool input JSON", () => {
    const c = { PreToolUse: [{ inputPattern: "/etc/", command: "y" }, { command: "always" }] };
    expect(matchingHooks(c, "PreToolUse", { toolInputJson: '{"path":"/etc/hosts"}' }).map((h) => h.command)).toEqual(["y", "always"]);
    expect(matchingHooks(c, "PreToolUse", { toolInputJson: '{"path":"/tmp/safe"}' }).map((h) => h.command)).toEqual(["always"]);
  });

  it("promptPattern filters UserPromptSubmit by prompt text", () => {
    const c = { UserPromptSubmit: [{ promptPattern: "^/skill", command: "z" }, { command: "always" }] };
    expect(matchingHooks(c, "UserPromptSubmit", { prompt: "/skill run foo" }).map((h) => h.command)).toEqual(["z", "always"]);
    expect(matchingHooks(c, "UserPromptSubmit", { prompt: "just a question" }).map((h) => h.command)).toEqual(["always"]);
  });

  it("onError only fires for failed tool calls", () => {
    const c = { PostToolUse: [{ onError: true, command: "err-hook" }, { command: "always" }] };
    expect(matchingHooks(c, "PostToolUse", { isError: true }).map((h) => h.command)).toEqual(["err-hook", "always"]);
    expect(matchingHooks(c, "PostToolUse", { isError: false }).map((h) => h.command)).toEqual(["always"]);
    expect(matchingHooks(c, "PostToolUse", {}).map((h) => h.command)).toEqual(["always"]);
  });

  it("sessionType filters by session mode", () => {
    const c = {
      UserPromptSubmit: [
        { sessionType: "interactive" as const, command: "int-hook" },
        { sessionType: "one-shot" as const, command: "run-hook" },
        { command: "always" },
      ],
    };
    expect(matchingHooks(c, "UserPromptSubmit", { sessionType: "interactive" }).map((h) => h.command)).toEqual(["int-hook", "always"]);
    expect(matchingHooks(c, "UserPromptSubmit", { sessionType: "one-shot" }).map((h) => h.command)).toEqual(["run-hook", "always"]);
    expect(matchingHooks(c, "UserPromptSubmit", {}).map((h) => h.command)).toEqual(["int-hook", "run-hook", "always"]);
  });

  it("maintenance filters Setup hooks", () => {
    const c = {
      Setup: [
        { maintenance: true, command: "maintenance" },
        { maintenance: false, command: "normal" },
        { command: "always" },
      ],
    };
    expect(matchingHooks(c, "Setup", { maintenance: true }).map((h) => h.command)).toEqual(["maintenance", "always"]);
    expect(matchingHooks(c, "Setup", { maintenance: false }).map((h) => h.command)).toEqual(["normal", "always"]);
  });

  it("uses matcherValue for non-tool event matchers", () => {
    const c = { ConfigChange: [{ matcher: "project_settings", command: "project" }, { command: "always" }] };
    expect(matchingHooks(c, "ConfigChange", { matcherValue: "project_settings" }).map((h) => h.command)).toEqual(["project", "always"]);
    expect(matchingHooks(c, "ConfigChange", { matcherValue: "user_settings" }).map((h) => h.command)).toEqual(["always"]);
  });
});

describe("runShellHook", () => {
  it("captures exit code and stdout", async () => {
    const r = await runShellHook("echo hello", "{}");
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("hello");
  });

  it("captures a non-zero exit", async () => {
    expect((await runShellHook("exit 3", "{}")).code).toBe(3);
  });

  it("pipes the JSON context to the hook's stdin", async () => {
    const r = await runShellHook("cat", '{"tool":"write_file"}');
    expect(r.stdout).toContain("write_file");
  });

  it("does not surface EPIPE when a hook exits before reading stdin", async () => {
    const r = await runShellHook("true", "x".repeat(1_000_000));
    expect(r.code).toBe(0);
  });
});

describe("firePreToolUse — gates execution by exit code", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "vanta-hooks-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("BLOCKS the tool when a matching hook exits non-zero", async () => {
    await writeHooks(dir, { PreToolUse: [{ matcher: "write_file", command: "echo nope >&2; exit 1" }] });
    const r = await firePreToolUse(dir, "write_file", { path: "x" });
    expect(r.blocked).toBe(true);
    expect(r.reason).toContain("nope");
  });

  it("allows the tool when the hook exits 0", async () => {
    await writeHooks(dir, { PreToolUse: [{ matcher: "write_file", command: "exit 0" }] });
    expect((await firePreToolUse(dir, "write_file", {})).blocked).toBe(false);
  });

  it("does not block a tool the matcher does not match", async () => {
    await writeHooks(dir, { PreToolUse: [{ matcher: "write_file", command: "exit 1" }] });
    expect((await firePreToolUse(dir, "read_file", {})).blocked).toBe(false);
  });

  it("allows when there are no hooks at all", async () => {
    expect((await firePreToolUse(dir, "write_file", {})).blocked).toBe(false);
  });

  it("delivers the tool name to the hook via stdin (the hook gates on it)", async () => {
    await writeHooks(dir, { PreToolUse: [{ command: "grep -q write_file && exit 2 || exit 0" }] });
    expect((await firePreToolUse(dir, "write_file", {})).blocked).toBe(true);
    expect((await firePreToolUse(dir, "read_file", {})).blocked).toBe(false);
  });
});

describe("fireHooks — non-blocking events run to completion", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "vanta-hooks-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("runs PostToolUse hooks even when they exit non-zero (no throw, never blocks)", async () => {
    const marker = join(dir, "fired");
    await writeHooks(dir, { PostToolUse: [{ command: `touch ${marker}; exit 1` }] });
    await fireHooks(dir, "PostToolUse", { tool: "write_file" }, { toolName: "write_file" });
    await expect(access(marker)).resolves.toBeUndefined();
  });

  it("runs Stop hooks regardless of matcher", async () => {
    const marker = join(dir, "stopped");
    await writeHooks(dir, { Stop: [{ matcher: "ignored", command: `touch ${marker}` }] });
    await fireHooks(dir, "Stop", { sessionId: "s1" });
    await expect(access(marker)).resolves.toBeUndefined();
  });

  it("runs Setup and SessionStart lifecycle hooks", async () => {
    const marker = join(dir, "lifecycle");
    await writeHooks(dir, {
      Setup: [{ command: `printf setup >> ${marker}` }],
      SessionStart: [{ command: `printf start >> ${marker}` }],
    });
    await fireHooks(dir, "Setup", { sessionId: "s1" });
    await fireHooks(dir, "SessionStart", { sessionId: "s1" });
    await expect(access(marker)).resolves.toBeUndefined();
  });
});

describe("fireStopHook — additionalContext from Stop hooks", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "vanta-hooks-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("returns null when no Stop hooks are configured", async () => {
    expect(await fireStopHook(dir, { sessionId: "s1" })).toBeNull();
  });

  it("returns null when a Stop hook outputs no JSON", async () => {
    await writeHooks(dir, { Stop: [{ command: "echo 'done'" }] });
    expect(await fireStopHook(dir, { sessionId: "s1" })).toBeNull();
  });

  it("returns null when a Stop hook outputs JSON without additionalContext", async () => {
    await writeHooks(dir, { Stop: [{ command: `echo '{"status":"ok"}'` }] });
    expect(await fireStopHook(dir, { sessionId: "s1" })).toBeNull();
  });

  it("returns the additionalContext string from a Stop hook's stdout JSON", async () => {
    await writeHooks(dir, { Stop: [{ command: `echo '{"additionalContext":"Tests failed — fix them"}'` }] });
    const result = await fireStopHook(dir, { sessionId: "s1" });
    expect(result).toBe("Tests failed — fix them");
  });

  it("returns the first non-empty additionalContext across multiple hooks (ordered)", async () => {
    await writeHooks(dir, {
      Stop: [
        { command: "echo 'not json'" },
        { command: `echo '{"additionalContext":"second hook context"}'` },
      ],
    });
    const result = await fireStopHook(dir, { sessionId: "s1" });
    expect(result).toBe("second hook context");
  });

  it("returns null gracefully when hooks.json is missing (best-effort)", async () => {
    expect(await fireStopHook(dir, { sessionId: "s1" })).toBeNull();
  });
});
