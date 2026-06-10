import { describe, it, expect } from "vitest";
import { consumeStream, isConcurrencySafe, CONCURRENCY_SAFE_TOOLS } from "./stream-dispatch.js";
import type { StreamChunk } from "../providers/interface.js";
import type { ToolCall } from "../types.js";

async function* gen(chunks: StreamChunk[]): AsyncIterable<StreamChunk> {
  for (const c of chunks) yield c;
}

const call = (id: string, name: string): ToolCall => ({ id, name, arguments: {} });

describe("isConcurrencySafe", () => {
  it("is true for side-effect-free reads", () => {
    expect(isConcurrencySafe("read_file")).toBe(true);
    expect(isConcurrencySafe("grep_files")).toBe(true);
    expect(isConcurrencySafe("web_fetch")).toBe(true);
  });

  it("is false for writes / shell / exec", () => {
    expect(isConcurrencySafe("write_file")).toBe(false);
    expect(isConcurrencySafe("edit_file")).toBe(false);
    expect(isConcurrencySafe("shell_cmd")).toBe(false);
    expect(isConcurrencySafe("run_code")).toBe(false);
  });

  it("does not include any obviously mutating tool", () => {
    for (const name of CONCURRENCY_SAFE_TOOLS) {
      expect(name).not.toMatch(/write|edit|delete|shell|run_code|commit|push|send|create|update/);
    }
  });
});

describe("consumeStream", () => {
  it("forwards text deltas in order and returns the assembled done result", async () => {
    const deltas: string[] = [];
    const result = await consumeStream({
      stream: gen([
        { type: "text", delta: "Hel" },
        { type: "text", delta: "lo" },
        { type: "done", result: { text: "Hello", toolCalls: [], finishReason: "stop" } },
      ]),
      onTextDelta: (d) => deltas.push(d),
    });
    expect(deltas).toEqual(["Hel", "lo"]);
    expect(result?.text).toBe("Hello");
  });

  it("hands safe tool blocks to onSafeToolCall but never unsafe ones", async () => {
    const started: string[] = [];
    await consumeStream({
      stream: gen([
        { type: "tool_call", call: call("r1", "read_file") },
        { type: "tool_call", call: call("w1", "write_file") },
        { type: "tool_call", call: call("g1", "grep_files") },
        { type: "done", result: { text: "", toolCalls: [], finishReason: "tool_calls" } },
      ]),
      onTextDelta: () => {},
      onSafeToolCall: (c) => started.push(c.name),
    });
    expect(started).toEqual(["read_file", "grep_files"]); // write_file filtered out
  });

  it("returns null when the stream produced no done chunk", async () => {
    const result = await consumeStream({
      stream: gen([{ type: "text", delta: "x" }]),
      onTextDelta: () => {},
    });
    expect(result).toBeNull();
  });

  it("throws AbortError when the signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      consumeStream({
        stream: gen([{ type: "text", delta: "x" }]),
        onTextDelta: () => {},
        signal: ac.signal,
      }),
    ).rejects.toThrow(/abort/i);
  });
});
