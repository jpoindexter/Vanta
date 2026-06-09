import { describe, it, expect } from "vitest";
import { briefTool } from "./brief.js";

const ctx = { root: "/tmp", safety: {} as never, requestApproval: async () => true };

describe("briefTool", () => {
  it("sends a normal notification", async () => {
    const result = await briefTool.execute({ message: "Build succeeded" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("NORMAL");
    expect(result.output).toContain("Build succeeded");
  });

  it("sends a proactive alert", async () => {
    const result = await briefTool.execute(
      { message: "Deployment complete", status: "proactive" },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.output).toContain("PROACTIVE");
    expect(result.output).toContain("Deployment complete");
  });

  it("includes file attachments", async () => {
    const result = await briefTool.execute(
      {
        message: "Check the logs",
        files: ["/tmp/build.log", "/tmp/test.log"],
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.output).toContain("Attachments");
    expect(result.output).toContain("build.log");
    expect(result.output).toContain("test.log");
  });

  it("rejects empty message", async () => {
    const result = await briefTool.execute({ message: "" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Invalid");
  });

  it("defaults status to normal", async () => {
    const result = await briefTool.execute({ message: "Update" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("NORMAL");
  });
});
