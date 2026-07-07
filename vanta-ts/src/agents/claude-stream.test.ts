import { describe, it, expect } from "vitest";
import { parseClaudeStreamLine, extractEditedPath } from "./claude-stream.js";

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

describe("extractEditedPath (VANTA-COMMIT-ATTRIBUTION seam)", () => {
  it("returns the file_path of a Write tool_use", () => {
    const line = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Write","input":{"file_path":"src/x.ts","content":"y"}}]}}';
    expect(extractEditedPath(line)).toBe("src/x.ts");
  });
  it("returns the file_path of an Edit tool_use", () => {
    const line = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit","input":{"file_path":"a.ts"}}]}}';
    expect(extractEditedPath(line)).toBe("a.ts");
  });
  it("returns null for a non-edit tool (Read) or noise", () => {
    expect(extractEditedPath('{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"a.ts"}}]}}')).toBeNull();
    expect(extractEditedPath("not json")).toBeNull();
  });
});
