import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAgentInvocation, runExternalAgent, knownAgents, detectInstalledAgents, type ExecFn } from "./external-cli.js";

describe("buildAgentInvocation — verified built-ins", () => {
  const env = {} as NodeJS.ProcessEnv;
  it("builds claude / codex / gemini non-interactive argv", () => {
    expect(buildAgentInvocation("claude", "hi", undefined, env)).toEqual({ cmd: "claude", args: ["-p", "hi"] });
    expect(buildAgentInvocation("codex", "hi", "gpt-5", env)).toEqual({ cmd: "codex", args: ["exec", "-m", "gpt-5", "hi"] });
    expect(buildAgentInvocation("gemini", "hi", undefined, env)).toEqual({ cmd: "gemini", args: ["-p", "hi"] });
  });
  it("returns null for an unknown agent", () => {
    expect(buildAgentInvocation("nope", "hi", undefined, env)).toBeNull();
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
    expect(buildAgentInvocation("aider", "fix bug", "sonnet", env)).toEqual({ cmd: "aider", args: ["--model", "sonnet", "--message", "fix bug"] });
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

describe("runExternalAgent — spawn + classify", () => {
  it("returns stdout on success", async () => {
    const exec: ExecFn = (_c, _a, _o, cb) => cb(null, "the answer", "");
    const r = await runExternalAgent({ cmd: "claude", args: ["-p", "x"] }, { cwd: "/tmp", exec });
    expect(r.ok).toBe(true);
    expect(r.stdout).toBe("the answer");
  });
  it("flags a not-installed CLI (ENOENT)", async () => {
    const exec: ExecFn = (_c, _a, _o, cb) => cb(Object.assign(new Error("nope"), { code: "ENOENT" }), "", "");
    const r = await runExternalAgent({ cmd: "ghost", args: [] }, { cwd: "/tmp", exec });
    expect(r.notInstalled).toBe(true);
  });
  it("reports a non-zero exit as failure", async () => {
    const exec: ExecFn = (_c, _a, _o, cb) => cb(Object.assign(new Error("bad"), { code: 2 }), "", "boom");
    const r = await runExternalAgent({ cmd: "claude", args: [] }, { cwd: "/tmp", exec });
    expect(r.ok).toBe(false);
    expect(r.code).toBe(2);
    expect(r.stderr).toBe("boom");
  });
});
