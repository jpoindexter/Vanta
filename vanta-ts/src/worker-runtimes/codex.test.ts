import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { codexArgs, codexResumeArgs } from "./codex.js";
import { createCodexParser } from "./codex-parse.js";
import type { RunInput } from "./types.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const parse = (name: string) => {
  const parser = createCodexParser();
  const events = readFileSync(join(dir, name), "utf8").split("\n").filter(Boolean).flatMap((l) => parser.feed(l));
  return { events, result: parser.result() };
};
const input = (patch: Partial<RunInput> = {}, model?: string): RunInput =>
  ({ ticket: { id: "T-1", title: "t", workerId: "w", role: "r", runId: "r1", ...(model ? { model } : {}) }, instruction: "do it", cwd: "/work", signal: new AbortController().signal, onEvent: () => {}, ...patch });

describe("codexArgs", () => {
  it("runs exec with JSONL output, the workspace-write sandbox and the prompt on stdin", () => {
    expect(codexArgs({ input: input(), prompt: "SECRET", scratchDir: "/tmp/s" })).toEqual(["exec", "--json", "-s", "workspace-write", "-C", "/work", "-o", "/tmp/s/last-message.txt", "-"]);
  });

  it("uses the read-only sandbox for read-only access and passes the model", () => {
    const args = codexArgs({ input: input({ access: "read-only" }, "gpt-5"), prompt: "p" });
    expect(args).toEqual(expect.arrayContaining(["-s", "read-only", "-m", "gpt-5"]));
  });

  it("never bypasses codex's approvals or sandbox", () => {
    expect(codexArgs({ input: input(), prompt: "p" }).join(" ")).not.toContain("dangerously");
    expect(codexResumeArgs({ input: input(), prompt: "p", sessionId: "s" }).join(" ")).not.toContain("dangerously");
  });

  it("resumes by session id with the sandbox set through a config override", () => {
    expect(codexResumeArgs({ input: input(), prompt: "p", sessionId: "0199-abc" })).toEqual(["exec", "resume", "--json", "-c", 'sandbox_mode="workspace-write"', "0199-abc", "-"]);
  });
});

describe("createCodexParser", () => {
  it("reads the thread id, the last agent message and the token counts, with no cost", () => {
    const { result } = parse("codex-events.jsonl");
    expect(result).toMatchObject({ failed: false, sessionId: "0199a213-81c0-7800-8aa1-bbab2a035a53", finalMessage: "Updated src/index.ts to export the helper.", usage: { inputTokens: 24763, outputTokens: 122, costUsd: null } });
  });

  it("emits tool events for commands and file changes", () => {
    const texts = parse("codex-events.jsonl").events.filter((e) => e.kind === "tool").map((e) => e.text);
    expect(texts).toEqual(["run bash -lc ls", "edit /work/project/src/index.ts"]);
  });

  it("treats a retry notice before a completed turn as success", () => {
    expect(parse("codex-retry-then-ok.jsonl").result).toMatchObject({ failed: false, finalMessage: "Done." });
  });

  it("fails on turn.failed with the CLI's message", () => {
    expect(parse("codex-failed.jsonl").result).toMatchObject({ failed: true, errorText: "stream disconnected before completion" });
  });

  it("fails when the stream stops before any turn completes", () => {
    const parser = createCodexParser();
    parser.feed('{"type":"thread.started","thread_id":"t"}');
    expect(parser.result().failed).toBe(true);
  });
});
