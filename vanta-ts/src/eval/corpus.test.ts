import { describe, it, expect } from "vitest";
import { parseTask } from "./corpus.js";

describe("parseTask", () => {
  it("accepts a well-formed task", () => {
    const t = parseTask(JSON.stringify({
      id: "hello", instruction: "create hello.txt with 'hi'",
      check: { kind: "file_contains", path: "hello.txt", text: "hi" },
    }));
    expect(t.id).toBe("hello");
    expect(t.check.kind).toBe("file_contains");
  });

  it("accepts seed files", () => {
    const t = parseTask(JSON.stringify({
      id: "fix", instruction: "fix the bug",
      seed: { "src/a.ts": "export const x = 1" },
      check: { kind: "shell_ok", cmd: "test -f src/a.ts" },
    }));
    expect(t.seed?.["src/a.ts"]).toContain("export const x");
  });

  it("rejects an unknown check kind", () => {
    expect(() => parseTask(JSON.stringify({
      id: "bad", instruction: "x", check: { kind: "telepathy" },
    }))).toThrow();
  });

  it("rejects a task missing id/instruction", () => {
    expect(() => parseTask(JSON.stringify({ check: { kind: "file_exists", path: "a" } }))).toThrow();
  });
});
