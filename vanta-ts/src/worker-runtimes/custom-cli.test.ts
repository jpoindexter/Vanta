import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { passGate } from "./__fixtures__/fake-spawn.js";
import { createCustomCliRuntime, customCliSpec, loadCustomCliEntries, CustomCliEntrySchema } from "./custom-cli.js";
import { hermesArgs, hermesSpec, parseHermesUsage } from "./hermes.js";
import type { RunInput } from "./types.js";

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), "vanta-wr-home-")); });
afterEach(() => rmSync(home, { recursive: true, force: true }));

function input(model?: string): RunInput {
  return { ticket: { id: "T-1", title: "t", workerId: "w", role: "r", runId: "r1", ...(model ? { model } : {}) }, instruction: "hello prompt", cwd: home, signal: new AbortController().signal, onEvent: () => {} };
}

describe("agents.json entries", () => {
  it("reads declared CLIs from an isolated VANTA_HOME and applies defaults", async () => {
    writeFileSync(join(home, "agents.json"), JSON.stringify({ agents: {
      aider: { cmd: "aider", args: ["--message", "{prompt}"], modelFlag: "--model" },
      piped: { cmd: "tool", args: ["--stdin"], promptVia: "stdin", selfApproving: false },
      "claude-code": { cmd: "evil", args: [] },
      "Bad Name": { cmd: "x", args: [] },
      broken: { cmd: 1 },
    } }));
    const entries = await loadCustomCliEntries({ VANTA_HOME: home });
    expect([...entries.keys()]).toEqual(["aider", "piped"]);
    expect(entries.get("aider")).toMatchObject({ promptVia: "argv", selfApproving: true });
    expect(entries.get("piped")).toMatchObject({ promptVia: "stdin", selfApproving: false });
  });

  it("returns nothing when agents.json is absent or malformed", async () => {
    expect((await loadCustomCliEntries({ VANTA_HOME: home })).size).toBe(0);
    writeFileSync(join(home, "agents.json"), "{not json");
    expect((await loadCustomCliEntries({ VANTA_HOME: home })).size).toBe(0);
  });
});

describe("custom CLI argv", () => {
  it("substitutes prompt and model into argv for the argv mode, like call_agent", () => {
    const spec = customCliSpec("aider", CustomCliEntrySchema.parse({ cmd: "aider", args: ["--message", "{prompt}"], modelFlag: "--model" }));
    expect(spec.build({ input: input("gpt-5"), prompt: "do it" })).toEqual({ args: ["--model", "gpt-5", "--message", "do it"] });
  });

  it("keeps the prompt out of argv in stdin mode", () => {
    const spec = customCliSpec("piped", CustomCliEntrySchema.parse({ cmd: "tool", args: ["--run"], promptVia: "stdin" }));
    expect(spec.build({ input: input(), prompt: "secret thing" })).toEqual({ args: ["--run"], stdin: "secret thing" });
  });

  it("is self-approving by default and never executed for detection", () => {
    const spec = customCliSpec("aider", CustomCliEntrySchema.parse({ cmd: "aider", args: [] }));
    expect(spec.selfApproving).toBe(true);
    expect(spec.detect.runVersion).toBe(false);
  });
});

describe("custom CLI, real process", () => {
  const script = "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log('echo:'+d.trim());console.log('args:'+process.argv.slice(1).join(','))})";
  const entry = (patch: object = {}) => CustomCliEntrySchema.parse({ cmd: process.execPath, args: ["-e", script, "x"], promptVia: "stdin", ...patch });

  it("delivers the prompt on stdin, streams lines as events and returns stdout as the final message", async () => {
    const events: string[] = [];
    const run = { ...input(), onEvent: (e: { text: string }) => events.push(e.text) };
    const out = await createCustomCliRuntime("node-echo", entry(), { gate: passGate, env: process.env }).run(run);
    expect(out.status).toBe("completed");
    expect(out.summary).toContain("echo:hello prompt");
    expect(out.summary).toContain("args:x");
    expect(events).toContain("echo:hello prompt");
    expect(out.usage).toBeUndefined();
  });

  it("fails on a non-zero exit", async () => {
    const out = await createCustomCliRuntime("node-fail", entry({ args: ["-e", "process.exit(3)"] }), { gate: passGate, env: process.env }).run(input());
    expect(out.status).toBe("failed");
    expect(out.error).toContain("code 3");
  });

  it("kills the whole process group when the signal aborts", async () => {
    const controller = new AbortController();
    const hang = entry({ args: ["-e", "setInterval(()=>{},1000)"], promptVia: "argv" });
    const pending = createCustomCliRuntime("node-hang", hang, { gate: passGate, env: process.env }).run({ ...input(), signal: controller.signal });
    setTimeout(() => controller.abort(), 400);
    const started = Date.now();
    const out = await pending;
    expect(out.status).toBe("aborted");
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe("hermes", () => {
  it("runs one-shot mode with a usage file and the model", () => {
    expect(hermesArgs({ input: input("anthropic/claude-sonnet-4.6"), prompt: "p", scratchDir: "/tmp/s" })).toEqual(["-m", "anthropic/claude-sonnet-4.6", "--usage-file", "/tmp/s/usage.json", "-z", "p"]);
  });

  it("is marked self-approving because one-shot mode bypasses its approvals", () => {
    expect(hermesSpec.selfApproving).toBe(true);
  });

  it("reads a usage report under any of the likely field spellings, and null when no cost is present", () => {
    expect(parseHermesUsage('{"model":"m","input_tokens":10,"output_tokens":4,"estimated_cost_usd":0.002}')).toEqual({ model: "m", usage: { inputTokens: 10, outputTokens: 4, costUsd: 0.002 } });
    expect(parseHermesUsage('{"prompt_tokens":7,"completion_tokens":3}').usage).toEqual({ inputTokens: 7, outputTokens: 3, costUsd: null });
  });

  it("reports nothing for a report it cannot read", () => {
    expect(parseHermesUsage("not json")).toEqual({});
    expect(parseHermesUsage('{"api_calls":2}')).toEqual({});
  });
});
