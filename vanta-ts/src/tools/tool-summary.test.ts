import { describe, it, expect } from "vitest";
import { summarizeToolBatch, formatToolSummary, type ToolCallBatch } from "./tool-summary.js";

describe("summarizeToolBatch", () => {
  it("summarizes read_file operations", () => {
    const batch: ToolCallBatch[] = [
      { toolName: "read_file", args: {}, result: { ok: true, output: "content" } },
    ];
    expect(summarizeToolBatch(batch)).toBe("read 1 file");
  });

  it("counts multiple reads", () => {
    const batch: ToolCallBatch[] = [
      { toolName: "read_file", args: {}, result: { ok: true, output: "" } },
      { toolName: "read_file", args: {}, result: { ok: true, output: "" } },
    ];
    expect(summarizeToolBatch(batch)).toBe("read 2 files");
  });

  it("summarizes write operations", () => {
    const batch: ToolCallBatch[] = [
      { toolName: "write_file", args: {}, result: { ok: true, output: "" } },
    ];
    expect(summarizeToolBatch(batch)).toBe("write 1 file");
  });

  it("summarizes git commit", () => {
    const batch: ToolCallBatch[] = [
      { toolName: "git_commit", args: {}, result: { ok: true, output: "" } },
    ];
    expect(summarizeToolBatch(batch)).toBe("commit");
  });

  it("summarizes shell commands", () => {
    const batch: ToolCallBatch[] = [
      { toolName: "shell_cmd", args: { command: "npm test" }, result: { ok: true, output: "" } },
    ];
    expect(summarizeToolBatch(batch)).toBe("run npm");
  });

  it("returns empty for empty batch", () => {
    expect(summarizeToolBatch([])).toBe("");
  });

  it("truncates to 30 chars", () => {
    const longSummary = "a".repeat(50);
    expect(formatToolSummary(longSummary).length).toBeLessThanOrEqual(30);
  });
});
