import { describe, it, expect } from "vitest";
import { runCodeTool } from "./run-code.js";
import type { ToolContext } from "./types.js";

// Auto-approve ctx: arbitrary execution is gated on requestApproval, which we
// short-circuit to true so the test exercises the real run path.
const approveCtx = {
  requestApproval: async () => true,
} as unknown as ToolContext;

describe("runCodeTool", () => {
  it("runs node code and captures stdout", async () => {
    const result = await runCodeTool.execute(
      { language: "node", code: "console.log(2 + 3)" },
      approveCtx,
    );

    expect(result.ok).toBe(true);
    expect(result.output).toContain("5");
  });

  it("rejects an invalid language", async () => {
    const result = await runCodeTool.execute(
      { language: "ruby", code: "puts 1" },
      approveCtx,
    );

    expect(result.ok).toBe(false);
    expect(result.output).toContain("python|node|rust");
  });

  it("returns denied when approval is refused", async () => {
    const denyCtx = {
      requestApproval: async () => false,
    } as unknown as ToolContext;

    const result = await runCodeTool.execute(
      { language: "node", code: "console.log(1)" },
      denyCtx,
    );

    expect(result.ok).toBe(false);
    expect(result.output).toBe("denied");
  });

  it("describes the call without leaking the code body", () => {
    const description = runCodeTool.describeForSafety?.({
      language: "node",
      code: "console.log('secret rm -rf /')",
    });

    expect(description).toBe("run node code");
  });
});
