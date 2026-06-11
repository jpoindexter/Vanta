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

  it("rejects a hook with no command (zod) → {}", async () => {
    await writeHooks(dir, { PreToolUse: [{ matcher: "x" }] });
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

  it("matches by regex on the tool name", () => {
    expect(matchingHooks(cfg, "PreToolUse", "write_file").map((h) => h.command)).toEqual(["a", "c"]);
  });

  it("matches read_file via ^read + the no-matcher hook", () => {
    expect(matchingHooks(cfg, "PreToolUse", "read_file").map((h) => h.command)).toEqual(["b", "c"]);
  });

  it("returns all hooks when no tool name is given (non-tool events)", () => {
    expect(matchingHooks(cfg, "PreToolUse", undefined)).toHaveLength(3);
  });

  it("is empty for an event with no hooks", () => {
    expect(matchingHooks(cfg, "Stop")).toEqual([]);
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
