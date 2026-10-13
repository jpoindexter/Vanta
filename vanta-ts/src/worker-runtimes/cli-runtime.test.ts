import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClaudeCodeRuntime } from "./claude-code.js";
import { createCodexRuntime } from "./codex.js";
import { fakeSpawn, passGate } from "./__fixtures__/fake-spawn.js";
import type { LaunchGate, LaunchRequest } from "./launch-gate.js";
import type { RunEvent, RunInput } from "./types.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const lines = (name: string): string[] => readFileSync(join(fixtures, name), "utf8").split("\n").filter(Boolean);

let repo: string;
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "vanta-wr-repo-"));
  const git = (...args: string[]): void => { execFileSync("git", args, { cwd: repo, stdio: "ignore" }); };
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  writeFileSync(join(repo, "README.md"), "# project\n");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

function input(patch: Partial<RunInput> = {}): { input: RunInput; events: RunEvent[]; controller: AbortController } {
  const events: RunEvent[] = [];
  const controller = new AbortController();
  return { events, controller, input: { ticket: { id: "T-1", title: "Write notes", workerId: "dev", role: "Engineer", runId: "r1" }, instruction: "Summarise the README into NOTES.md. token sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA", cwd: repo, signal: controller.signal, onEvent: (e) => events.push(e), ...patch } };
}

describe("Claude Code runtime run()", () => {
  it("launches headless with the prompt on stdin (redacted), then returns message, usage, session and the changed files", async () => {
    const fake = fakeSpawn({ stdout: lines("claude-stream-success.jsonl"), run: () => writeFileSync(join(repo, "NOTES.md"), "hello\n") });
    const { input: run, events } = input();
    const out = await createClaudeCodeRuntime({ gate: passGate, env: {}, spawnFactory: fake.factory }).run(run);
    const launch = fake.launches[0]!;
    expect(launch.cmd).toBe("claude");
    expect(launch.args).toEqual(["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits"]);
    expect(launch.cwd).toBe(repo);
    expect(launch.stdin).toContain("Summarise the README");
    expect(launch.stdin).not.toContain("sk-ant-api03");
    expect(launch.args.join(" ")).not.toContain("Summarise");
    expect(out).toMatchObject({ status: "completed", summary: "Created NOTES.md with a summary of the README.", usage: { inputTokens: 4620, outputTokens: 240, costUsd: 0.0412 }, sessionRef: { runtimeId: "claude-code", sessionId: "3f8a2c1e-0b7d-4e55-9a41-6d2f0c9b7a10", cwd: repo }, model: "claude-sonnet-4-5" });
    expect(out.workProducts.map((p) => p.source)).toEqual(["final-message", "git-diff"]);
    expect(out.workProducts[1]).toMatchObject({ kind: "code", files: ["NOTES.md"] });
    expect(out.workProducts[1]!.content).toContain("NOTES.md");
    expect(events.map((e) => e.kind)).toEqual(expect.arrayContaining(["status", "tool", "message", "usage"]));
  });

  it("passes the remaining budget to the CLI as a hard cap", async () => {
    const fake = fakeSpawn({ stdout: lines("claude-stream-success.jsonl") });
    await createClaudeCodeRuntime({ gate: passGate, env: {}, spawnFactory: fake.factory }).run(input({ maxBudgetUsd: 0.75 }).input);
    expect(fake.launches[0]!.args).toEqual(expect.arrayContaining(["--max-budget-usd", "0.75"]));
  });

  it("reports a budget stop as failed but keeps the spend", async () => {
    const fake = fakeSpawn({ stdout: lines("claude-stream-budget.jsonl"), code: 1 });
    const out = await createClaudeCodeRuntime({ gate: passGate, env: {}, spawnFactory: fake.factory }).run(input().input);
    expect(out).toMatchObject({ status: "failed", error: "error_max_budget_usd", usage: { costUsd: 0.5012 } });
  });

  it("reports not installed when the binary is missing", async () => {
    const out = await createClaudeCodeRuntime({ gate: passGate, env: {}, spawnFactory: fakeSpawn({ missing: true }).factory }).run(input().input);
    expect(out).toMatchObject({ status: "failed" });
    expect(out.error).toContain("not installed");
  });

  it("stops the process when the signal aborts and reports aborted", async () => {
    const fake = fakeSpawn({ stdout: [lines("claude-stream-success.jsonl")[0]!], hold: true });
    const { input: run, controller } = input();
    const pending = createClaudeCodeRuntime({ gate: passGate, env: {}, spawnFactory: fake.factory }).run(run);
    setTimeout(() => controller.abort(), 30);
    const out = await pending;
    expect(out.status).toBe("aborted");
  });

  it("does not launch when the gate refuses", async () => {
    const fake = fakeSpawn({ stdout: [] });
    const gate: LaunchGate = { authorize: async () => ({ ok: false, error: "the owner declined to launch Claude Code for T-1" }) };
    const out = await createClaudeCodeRuntime({ gate, env: {}, spawnFactory: fake.factory }).run(input().input);
    expect(fake.launches).toHaveLength(0);
    expect(out).toMatchObject({ status: "refused", error: "the owner declined to launch Claude Code for T-1" });
  });

  it("hands the gate an exact description: CLI, directory, ticket, access", async () => {
    const seen: LaunchRequest[] = [];
    const gate: LaunchGate = { authorize: async (r) => { seen.push(r); return { ok: false, error: "stop" }; } };
    await createClaudeCodeRuntime({ gate, env: {} }).run(input({ access: "read-only" }).input);
    expect(seen[0]).toMatchObject({ runtimeId: "claude-code", command: "claude", cwd: repo, ticketId: "T-1", access: "read-only", selfApproving: false });
  });

  it("resumes the recorded session", async () => {
    const fake = fakeSpawn({ stdout: lines("claude-stream-success.jsonl") });
    const runtime = createClaudeCodeRuntime({ gate: passGate, env: {}, spawnFactory: fake.factory });
    await runtime.resume!({ ...input().input, sessionRef: { runtimeId: "claude-code", sessionId: "sess-1", cwd: repo } });
    expect(fake.launches[0]!.args.slice(-2)).toEqual(["--resume", "sess-1"]);
  });
});

describe("Codex runtime run()", () => {
  it("launches exec mode, prefers the last-message file, and reports tokens with no cost", async () => {
    const fake = fakeSpawn({
      stdout: lines("codex-events.jsonl"),
      run: (launch) => { writeFileSync(launch.args[launch.args.indexOf("-o") + 1]!, "Final answer from file\n"); },
    });
    const out = await createCodexRuntime({ gate: passGate, env: {}, spawnFactory: fake.factory }).run(input().input);
    const launch = fake.launches[0]!;
    expect(launch.cmd).toBe("codex");
    expect(launch.args.slice(0, 6)).toEqual(["exec", "--json", "-s", "workspace-write", "-C", repo]);
    expect(launch.args.at(-1)).toBe("-");
    expect(launch.stdin).toContain("Summarise the README");
    expect(out).toMatchObject({ status: "completed", summary: "Final answer from file", usage: { inputTokens: 24763, outputTokens: 122, costUsd: null }, sessionRef: { sessionId: "0199a213-81c0-7800-8aa1-bbab2a035a53" } });
  });

  it("falls back to the streamed agent message when no file is written", async () => {
    const out = await createCodexRuntime({ gate: passGate, env: {}, spawnFactory: fakeSpawn({ stdout: lines("codex-events.jsonl") }).factory }).run(input().input);
    expect(out.summary).toBe("Updated src/index.ts to export the helper.");
  });

  it("fails a turn that failed", async () => {
    const out = await createCodexRuntime({ gate: passGate, env: {}, spawnFactory: fakeSpawn({ stdout: lines("codex-failed.jsonl"), code: 1 }).factory }).run(input().input);
    expect(out).toMatchObject({ status: "failed", error: "stream disconnected before completion" });
  });
});
