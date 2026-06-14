import { describe, expect, it } from "vitest";
import { extractLastTurnCalls, detectAnomalies, formatAnomalyNote } from "./trace.js";
import type { Message } from "../types.js";

function makeMsg(
  role: "assistant" | "tool",
  opts: { content?: string; toolCalls?: Array<{ id: string; name: string }>; toolCallId?: string; name?: string },
): Message {
  if (role === "assistant") {
    return {
      role: "assistant",
      content: opts.content ?? "",
      toolCalls: opts.toolCalls?.map((tc) => ({ id: tc.id, name: tc.name, arguments: {} })),
    };
  }
  return { role: "tool", toolCallId: opts.toolCallId!, name: opts.name!, content: opts.content ?? "" };
}

describe("extractLastTurnCalls", () => {
  it("returns [] when the last assistant message has no tool calls", () => {
    const msgs: Message[] = [{ role: "assistant", content: "hi" }];
    expect(extractLastTurnCalls(msgs)).toEqual([]);
  });

  it("returns calls matched by toolCallId", () => {
    const msgs: Message[] = [
      makeMsg("assistant", { toolCalls: [{ id: "tc1", name: "read_file" }, { id: "tc2", name: "write_file" }] }),
      makeMsg("tool", { toolCallId: "tc1", name: "read_file", content: "file content" }),
      makeMsg("tool", { toolCallId: "tc2", name: "write_file", content: "wrote ok" }),
    ];
    const calls = extractLastTurnCalls(msgs);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.name).toBe("read_file");
    expect(calls[1]!.name).toBe("write_file");
  });

  it("marks error results as isError=true", () => {
    const msgs: Message[] = [
      makeMsg("assistant", { toolCalls: [{ id: "tc1", name: "shell_cmd" }] }),
      makeMsg("tool", { toolCallId: "tc1", name: "shell_cmd", content: "Error: permission denied" }),
    ];
    expect(extractLastTurnCalls(msgs)[0]!.isError).toBe(true);
  });
});

describe("detectAnomalies", () => {
  it("returns [] when no calls are passed", () => {
    expect(detectAnomalies([])).toEqual([]);
  });

  it("detects a tool loop when the same tool appears ≥3 times", () => {
    const calls = Array.from({ length: 4 }, () => ({ name: "grep_files", result: "ok", isError: false }));
    const a = detectAnomalies(calls);
    expect(a.some((x) => x.type === "loop")).toBe(true);
    expect(a.find((x) => x.type === "loop")?.severity).toBe("warn");
  });

  it("marks severity alert when the same tool appears ≥6 times", () => {
    const calls = Array.from({ length: 6 }, () => ({ name: "read_file", result: "ok", isError: false }));
    const a = detectAnomalies(calls);
    expect(a.find((x) => x.type === "loop")?.severity).toBe("alert");
  });

  it("detects an error spike when ≥3 consecutive errors", () => {
    const calls = [
      { name: "shell_cmd", result: "Error: failed", isError: true },
      { name: "shell_cmd", result: "Error: failed", isError: true },
      { name: "shell_cmd", result: "Error: failed", isError: true },
    ];
    const a = detectAnomalies(calls);
    expect(a.some((x) => x.type === "error-spike")).toBe(true);
  });

  it("does NOT flag an error spike when errors are non-consecutive", () => {
    const calls = [
      { name: "shell_cmd", result: "Error", isError: true },
      { name: "read_file", result: "ok", isError: false },
      { name: "shell_cmd", result: "Error", isError: true },
      { name: "shell_cmd", result: "Error", isError: true },
    ];
    const a = detectAnomalies(calls);
    expect(a.some((x) => x.type === "error-spike")).toBe(false);
  });

  it("detects a blind-write when a write tool fires before any read", () => {
    const calls = [
      { name: "write_file", result: "wrote ok", isError: false },
      { name: "read_file", result: "file content", isError: false },
    ];
    const a = detectAnomalies(calls);
    expect(a.some((x) => x.type === "blind-write")).toBe(true);
  });

  it("does NOT flag blind-write when a read precedes the write", () => {
    const calls = [
      { name: "read_file", result: "content", isError: false },
      { name: "write_file", result: "wrote ok", isError: false },
    ];
    expect(detectAnomalies(calls).some((x) => x.type === "blind-write")).toBe(false);
  });

  it("returns empty when everything looks normal", () => {
    const calls = [
      { name: "read_file", result: "content", isError: false },
      { name: "write_file", result: "wrote", isError: false },
      { name: "shell_cmd", result: "ok", isError: false },
    ];
    expect(detectAnomalies(calls)).toEqual([]);
  });
});

describe("formatAnomalyNote", () => {
  it("formats anomalies with the ⚠ prefix", () => {
    const note = formatAnomalyNote([{ type: "loop", detail: "read_file called 4×", severity: "warn" }]);
    expect(note).toContain("⚠ trace[loop]");
    expect(note).toContain("read_file called 4×");
  });
});
