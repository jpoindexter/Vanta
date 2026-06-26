import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAgentInvocation, runExternalAgent, knownAgents, detectInstalledAgents, type SpawnFn, type ChildLike } from "./external-cli.js";

describe("buildAgentInvocation — verified built-ins", () => {
  const env = {} as NodeJS.ProcessEnv;
  it("builds claude / codex / gemini non-interactive argv", () => {
    expect(buildAgentInvocation("claude", "hi", { env })).toEqual({ cmd: "claude", args: ["-p", "hi"] });
    expect(buildAgentInvocation("codex", "hi", { model: "gpt-5", env })).toEqual({ cmd: "codex", args: ["exec", "-m", "gpt-5", "hi"] });
    expect(buildAgentInvocation("gemini", "hi", { env })).toEqual({ cmd: "gemini", args: ["-p", "hi"] });
  });
  it("coding:true makes claude build-ready (--permission-mode acceptEdits) so it can edit headless", () => {
    expect(buildAgentInvocation("claude", "build a page", { coding: true, env })).toEqual({
      cmd: "claude",
      args: ["-p", "--permission-mode", "acceptEdits", "build a page"],
    });
    // model + coding compose, in CLI order
    expect(buildAgentInvocation("claude", "x", { model: "opus", coding: true, env })).toEqual({
      cmd: "claude",
      args: ["-p", "--model", "opus", "--permission-mode", "acceptEdits", "x"],
    });
  });
  it("returns null for an unknown agent", () => {
    expect(buildAgentInvocation("nope", "hi", { env })).toBeNull();
  });
});

describe("custom agents from ~/.vanta/agents.json — any harness", () => {
  function homeWith(agents: unknown): NodeJS.ProcessEnv {
    const home = mkdtempSync(join(tmpdir(), "vanta-agents-"));
    writeFileSync(join(home, "agents.json"), JSON.stringify({ agents }), "utf8");
    return { VANTA_HOME: home } as NodeJS.ProcessEnv;
  }
  it("resolves a user-declared CLI with a {prompt} token", () => {
    const env = homeWith({ aider: { cmd: "aider", args: ["--message", "{prompt}"], modelFlag: "--model" } });
    expect(buildAgentInvocation("aider", "fix bug", { model: "sonnet", env })).toEqual({ cmd: "aider", args: ["--model", "sonnet", "--message", "fix bug"] });
    expect(knownAgents(env)).toContain("aider");
  });
});

describe("detectInstalledAgents — what the user actually has", () => {
  it("returns only agents whose cmd is on PATH", () => {
    const bin = mkdtempSync(join(tmpdir(), "vanta-bin-"));
    writeFileSync(join(bin, "claude"), "", "utf8");
    const env = { PATH: bin } as NodeJS.ProcessEnv;
    const found = detectInstalledAgents(env);
    expect(found).toContain("claude");
    expect(found).not.toContain("codex");
  });
});

/** A fake spawn that emits given stdout/stderr then closes (or errors). */
function fakeSpawn(o: { stdout?: string; stderr?: string; code?: number | null; errorCode?: string }): SpawnFn {
  return () => {
    const h: Record<string, (...a: unknown[]) => void> = {};
    const child: ChildLike = {
      stdout: { on: (_e, cb) => { if (o.stdout !== undefined) cb(o.stdout); } },
      stderr: { on: (_e, cb) => { if (o.stderr !== undefined) cb(o.stderr); } },
      on: (ev, cb) => { h[ev] = cb as (...a: unknown[]) => void; },
      kill: () => {},
    };
    queueMicrotask(() => {
      if (o.errorCode) h.error?.(Object.assign(new Error("x"), { code: o.errorCode }));
      else h.close?.(o.code ?? 0, null);
    });
    return child;
  };
}

describe("runExternalAgent — stream + classify", () => {
  it("returns stdout on success (byte-equivalent return)", async () => {
    const r = await runExternalAgent({ cmd: "claude", args: ["-p", "x"] }, { cwd: "/tmp", spawn: fakeSpawn({ stdout: "the answer", code: 0 }) });
    expect(r.ok).toBe(true);
    expect(r.stdout).toBe("the answer");
  });
  it("flags a not-installed CLI (ENOENT)", async () => {
    const r = await runExternalAgent({ cmd: "ghost", args: [] }, { cwd: "/tmp", spawn: fakeSpawn({ errorCode: "ENOENT" }) });
    expect(r.notInstalled).toBe(true);
  });
  it("reports a non-zero exit as failure", async () => {
    const r = await runExternalAgent({ cmd: "claude", args: [] }, { cwd: "/tmp", spawn: fakeSpawn({ stderr: "boom", code: 2 }) });
    expect(r.ok).toBe(false);
    expect(r.code).toBe(2);
    expect(r.stderr).toBe("boom");
  });
  it("STREAMS output line-by-line via onChunk while running", async () => {
    const chunks: string[] = [];
    const r = await runExternalAgent(
      { cmd: "claude", args: [] },
      { cwd: "/tmp", spawn: fakeSpawn({ stdout: "line one\nline two\n", code: 0 }), onChunk: (t) => chunks.push(t) },
    );
    expect(chunks).toEqual(["line one", "line two"]); // streamed before return
    expect(r.stdout).toBe("line one\nline two\n"); // full output still returned unchanged
  });
  it("return is identical whether or not onChunk is supplied", async () => {
    const spawn = () => fakeSpawn({ stdout: "same output", code: 0 })("", [], { cwd: "/tmp", env: {} as NodeJS.ProcessEnv });
    const withCb = await runExternalAgent({ cmd: "c", args: [] }, { cwd: "/tmp", spawn, onChunk: () => {} });
    const without = await runExternalAgent({ cmd: "c", args: [] }, { cwd: "/tmp", spawn });
    expect(withCb).toEqual(without);
  });
});
