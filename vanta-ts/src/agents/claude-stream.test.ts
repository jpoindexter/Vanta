import { describe, it, expect } from "vitest";
import { parseClaudeStreamLine } from "./claude-stream.js";

describe("parseClaudeStreamLine", () => {
  it("extracts a result event's final text + error flag", () => {
    expect(parseClaudeStreamLine('{"type":"result","is_error":false,"result":"Done: built index.html"}'))
      .toEqual({ result: "Done: built index.html", isError: false });
    expect(parseClaudeStreamLine('{"type":"result","is_error":true,"result":"failed"}'))
      .toEqual({ result: "failed", isError: true });
  });
  it("summarizes a tool_use as progress (name + file basename)", () => {
    const line = JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Write", input: { file_path: "/a/b/index.html" } }] } });
    expect(parseClaudeStreamLine(line)).toEqual({ progress: "Write(index.html)" });
  });
  it("summarizes assistant text as progress", () => {
    const line = JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Creating the hero section" }] } });
    expect(parseClaudeStreamLine(line)).toEqual({ progress: "Creating the hero section" });
  });
  it("ignores system/hook noise, empty content, and unparseable lines", () => {
    expect(parseClaudeStreamLine('{"type":"system","subtype":"hook_started"}')).toEqual({});
    expect(parseClaudeStreamLine('{"type":"assistant","message":{"content":[]}}')).toEqual({});
    expect(parseClaudeStreamLine("not json")).toEqual({});
    expect(parseClaudeStreamLine("")).toEqual({});
  });
});
