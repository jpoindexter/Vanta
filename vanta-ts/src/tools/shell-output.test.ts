import { describe, expect, it } from "vitest";
import { formatRunFailure } from "./shell-output.js";

describe("formatRunFailure sandbox recovery", () => {
  it("turns a macOS mkdir EPERM into actionable in-session recovery", () => {
    const result = formatRunFailure(
      "mkdir -p /Users/x/tool",
      {
        code: 1,
        message: "Command failed",
        stderr: "mkdir: /Users/x/tool: Operation not permitted",
      },
      "",
    );

    expect(result.ok).toBe(false);
    expect(result.output).toContain("Sandbox blocked a file write");
    expect(result.output).toContain("/add-dir /Users/x");
    expect(result.output).toContain("comma-separated VANTA_WRITABLE_DIRS");
  });
});
