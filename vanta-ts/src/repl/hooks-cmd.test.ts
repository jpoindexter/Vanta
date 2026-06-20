import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HANDLERS } from "./handlers.js";
import { loadShellHooks, shellHooksPath } from "../hooks/shell-hooks.js";
import type { ReplCtx } from "./types.js";

// Temp 'project' dirs carry no trust decision; opt past the project-trust gate.
process.env.VANTA_ENABLE_PROJECT_HOOKS = "1";

let root: string;
let dataDir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-hooks-cmd-"));
  dataDir = join(root, ".vanta");
  await mkdir(dataDir, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function ctx(): ReplCtx {
  return { dataDir } as unknown as ReplCtx;
}

describe("/hooks", () => {
  it("lists configured hooks grouped by event", async () => {
    await writeFile(
      shellHooksPath(dataDir),
      JSON.stringify({ PreToolUse: [{ command: "echo pre" }], SessionEnd: [{ command: "echo bye" }] }),
      "utf8",
    );

    const result = await HANDLERS.hooks!("", ctx());

    expect(result.output).toContain("PreToolUse");
    expect(result.output).toContain("1. echo pre");
    expect(result.output).toContain("SessionEnd");
  });

  it("labels non-command hook types when listing", async () => {
    await writeFile(
      shellHooksPath(dataDir),
      JSON.stringify({ PostToolUse: [{ type: "http", url: "http://127.0.0.1:9999/hook" }, { type: "agent", prompt: "Check it" }] }),
      "utf8",
    );

    const result = await HANDLERS.hooks!("", ctx());

    expect(result.output).toContain("http http://127.0.0.1:9999/hook");
    expect(result.output).toContain("agent");
  });

  it("adds a hook command and persists hooks.json", async () => {
    const result = await HANDLERS.hooks!("add UserPromptSubmit echo hello", ctx());
    const stored = await loadShellHooks(dataDir);

    expect(result.output).toContain("added");
    expect(stored.UserPromptSubmit?.[0]?.command).toBe("echo hello");
  });

  it("removes the Nth hook command for an event", async () => {
    await writeFile(
      shellHooksPath(dataDir),
      JSON.stringify({ Stop: [{ command: "echo one" }, { command: "echo two" }] }),
      "utf8",
    );

    const result = await HANDLERS.hooks!("remove Stop 1", ctx());
    const raw = await readFile(shellHooksPath(dataDir), "utf8");

    expect(result.output).toContain("removed");
    expect(JSON.parse(raw)).toEqual({ Stop: [{ command: "echo two" }] });
  });
});
