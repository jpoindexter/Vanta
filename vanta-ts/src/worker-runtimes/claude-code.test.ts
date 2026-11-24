import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildAgentInvocation } from "../agents/external-cli.js";
import { claudeArgs } from "./claude-code.js";
import { createClaudeParser } from "./claude-parse.js";
import type { RunEvent, RunInput } from "./types.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const lines = (name: string): string[] => readFileSync(join(dir, name), "utf8").split("\n").filter(Boolean);

function run(name: string): { events: RunEvent[]; result: ReturnType<ReturnType<typeof createClaudeParser>["result"]> } {
  const parser = createClaudeParser();
  const events = lines(name).flatMap((line) => parser.feed(line));
  return { events, result: parser.result() };
}

function input(patch: Partial<RunInput> = {}, model?: string): RunInput {
  return { ticket: { id: "T-1", title: "t", workerId: "w", role: "r", runId: "r1", ...(model ? { model } : {}) }, instruction: "do it", cwd: "/work", signal: new AbortController().signal, onEvent: () => {}, ...patch };
}

describe("claudeArgs", () => {
  it("runs headless stream-json in acceptEdits mode with the prompt kept out of argv", () => {
    const args = claudeArgs({ input: input(), prompt: "SECRET PROMPT" });
    expect(args).toEqual(["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits"]);
    expect(args.join(" ")).not.toContain("SECRET PROMPT");
  });

  it("uses plan mode for read-only access, passes model and a rounded budget cap", () => {
    const args = claudeArgs({ input: input({ access: "read-only", maxBudgetUsd: 1.234567 }, "opus") , prompt: "p" });
    expect(args).toEqual(expect.arrayContaining(["--permission-mode", "plan", "--model", "opus", "--max-budget-usd", "1.2346"]));
  });

  it("omits the budget flag when nothing is left to cap", () => {
    expect(claudeArgs({ input: input({ maxBudgetUsd: 0 }), prompt: "p" })).not.toContain("--max-budget-usd");
  });

  it("never asks the CLI to skip permissions", () => {
    for (const access of ["edit", "read-only"] as const) {
      expect(claudeArgs({ input: input({ access }), prompt: "p" })).not.toContain("--dangerously-skip-permissions");
    }
  });

  it("stays flag-compatible with the existing call_agent coding invocation", () => {
    const existing = buildAgentInvocation("claude", "PROMPT", { coding: true, env: {} })!.args.filter((a) => a !== "PROMPT" && a !== "sonnet" && a !== "--model");
    expect([...claudeArgs({ input: input(), prompt: "p" })].sort()).toEqual([...existing].sort());
  });
});

describe("createClaudeParser", () => {
  it("reads the final message, session, model, tokens and the CLI-reported cost", () => {
    const { result } = run("claude-stream-success.jsonl");
    expect(result).toMatchObject({
      failed: false,
      finalMessage: "Created NOTES.md with a summary of the README.",
      sessionId: "3f8a2c1e-0b7d-4e55-9a41-6d2f0c9b7a10",
      model: "claude-sonnet-4-5",
      usage: { inputTokens: 4620, outputTokens: 240, costUsd: 0.0412 },
    });
  });

  it("emits tool and message events as progress", () => {
    const { events } = run("claude-stream-success.jsonl");
    expect(events.map((e) => e.kind)).toEqual(["message", "tool", "tool", "usage"]);
    expect(events[1]!.text).toBe("Read(README.md)");
  });

  it("notes denied tool calls in the final message", () => {
    const { result } = run("claude-stream-denied.jsonl");
    expect(result.failed).toBe(false);
    expect(result.finalMessage).toContain("2 tool calls were denied");
  });

  it("marks a budget stop as failed and still reports what was spent", () => {
    const { result } = run("claude-stream-budget.jsonl");
    expect(result).toMatchObject({ failed: true, errorText: "error_max_budget_usd", usage: { costUsd: 0.5012, inputTokens: 900, outputTokens: 300 } });
  });

  it("fails when the stream ends without a result object", () => {
    const parser = createClaudeParser();
    parser.feed('{"type":"system","subtype":"init","session_id":"s"}');
    expect(parser.result()).toMatchObject({ failed: true, errorText: "claude ended without a result" });
  });

  it("records null, not zero, when the CLI reports no cost", () => {
    const parser = createClaudeParser();
    parser.feed('{"type":"result","subtype":"success","is_error":false,"result":"ok","usage":{"input_tokens":5,"output_tokens":6}}');
    expect(parser.result().usage).toEqual({ inputTokens: 5, outputTokens: 6, costUsd: null });
  });

  it("reports no usage at all when the result has none", () => {
    const parser = createClaudeParser();
    parser.feed('{"type":"result","subtype":"success","is_error":false,"result":"ok"}');
    expect(parser.result().usage).toBeUndefined();
  });

  it("ignores garbage lines and turns heartbeats into status events", () => {
    const parser = createClaudeParser();
    expect(parser.feed("not json")).toEqual([]);
    expect(parser.feed("… claude working (8s)")).toEqual([{ kind: "status", text: "claude working (8s)" }]);
  });
});
