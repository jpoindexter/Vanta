import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveHookExec } from "./hook-exec-form.js";
import { runExecHook, runShellHook } from "./shell-hook-run.js";
import type { ShellHook } from "./shell-hooks.js";

describe("resolveHookExec (pure form resolver)", () => {
  it("resolves command-only to the shell form, preserving the command verbatim", () => {
    const hook: ShellHook = { command: "echo hi" };
    expect(resolveHookExec(hook)).toEqual({ form: "shell", command: "echo hi" });
  });

  it("resolves args to the exec form: args[0] is the file, the rest are args", () => {
    const hook: ShellHook = { args: ["jq", "-r", ".tool"] };
    expect(resolveHookExec(hook)).toEqual({ form: "exec", file: "jq", args: ["-r", ".tool"] });
  });

  it("a single-element args resolves to exec form with an empty args tail", () => {
    const hook: ShellHook = { args: ["true"] };
    expect(resolveHookExec(hook)).toEqual({ form: "exec", file: "true", args: [] });
  });

  it("args takes precedence over command (the explicit argv is the safe request)", () => {
    const hook: ShellHook = { command: "echo via-shell", args: ["echo", "via-exec"] };
    expect(resolveHookExec(hook)).toEqual({ form: "exec", file: "echo", args: ["via-exec"] });
  });

  it("an empty args array is an error (no file to spawn)", () => {
    const result = resolveHookExec({ args: [] });
    expect(result.form).toBe("error");
    if (result.form === "error") expect(result.reason).toMatch(/non-empty/);
  });

  it("a blank-only args[0] is an error", () => {
    const result = resolveHookExec({ args: ["   "] });
    expect(result.form).toBe("error");
  });

  it("neither args nor command is an error", () => {
    const result = resolveHookExec({});
    expect(result.form).toBe("error");
    if (result.form === "error") expect(result.reason).toMatch(/neither args nor command/);
  });

  it("a blank command (no args) is an error, not a shell form", () => {
    expect(resolveHookExec({ command: "   " }).form).toBe("error");
  });
});

describe("runExecHook (direct execFile spawn — no shell)", () => {
  it("spawns the file with argv and captures stdout + exit code", async () => {
    const r = await runExecHook("node", ["-e", "process.stdout.write('ok')"], "{}");
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("ok");
  });

  it("pipes the JSON context to the child's stdin", async () => {
    const ctx = JSON.stringify({ event: "PreToolUse", tool: "x" });
    const r = await runExecHook(
      "node",
      ["-e", "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(s))"],
      ctx,
    );
    expect(r.stdout).toBe(ctx);
  });

  it("does NOT interpret shell metacharacters: a ';'-injection in an arg is a literal string, not a second command", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vanta-exec-hook-"));
    const marker = join(dir, "INJECTED");
    try {
      // Under a shell, `echo X; touch <marker>` would create the marker file.
      // execFile passes the whole string as ONE literal argv element to echo,
      // so the marker is never created — proving no shell interpretation.
      const r = await runExecHook("echo", [`X; touch ${marker}`], "{}");
      expect(r.code).toBe(0);
      expect(r.stdout.trim()).toBe(`X; touch ${marker}`);
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a missing executable fails open (code 0), never throwing across the boundary", async () => {
    const r = await runExecHook("this-binary-does-not-exist-vanta", [], "{}");
    expect(r.code).toBe(0);
  });
});

describe("runShellHook (shell-string path unchanged)", () => {
  it("still runs a command through the shell — metacharacters ARE interpreted", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vanta-shell-hook-"));
    const marker = join(dir, "SHELL_RAN");
    try {
      // The shell form deliberately interprets `;` — this is the existing,
      // unchanged behavior the exec form opts out of.
      const r = await runShellHook(`echo X; touch ${marker}`, "{}");
      expect(r.code).toBe(0);
      expect(r.stdout.trim()).toBe("X");
      expect(existsSync(marker)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("pipes context to stdin and returns the child's exit code", async () => {
    const r = await runShellHook("cat; exit 3", "payload");
    expect(r.code).toBe(3);
    expect(r.stdout).toBe("payload");
  });
});
