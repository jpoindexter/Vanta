import { describe, it, expect } from "vitest";
import { clarifyTool } from "./clarify.js";

const ctx = { root: "/tmp", safety: {} as never, requestApproval: async () => true };

describe("clarify tool", () => {
  it("returns the question text without options", async () => {
    const res = await clarifyTool.execute({ question: "Which file should I edit?" }, ctx);
    expect(res.ok).toBe(true);
    expect(res.output).toContain("Which file should I edit?");
    expect(res.output).toContain("Await the user's answer before proceeding.");
  });

  it("numbers each option when options are provided", async () => {
    const res = await clarifyTool.execute(
      { question: "Which environment?", options: ["staging", "production"] },
      ctx,
    );
    expect(res.ok).toBe(true);
    expect(res.output).toContain("1. staging");
    expect(res.output).toContain("2. production");
    expect(res.output).toContain("Which environment?");
  });

  it("returns ok:false when question is empty", async () => {
    const res = await clarifyTool.execute({ question: "" }, ctx);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("Invalid args");
  });

  it("returns ok:false when question is missing", async () => {
    const res = await clarifyTool.execute({}, ctx);
    expect(res.ok).toBe(false);
  });

  it("describeForSafety returns the expected string", () => {
    expect(clarifyTool.describeForSafety?.({})).toBe("ask user a clarifying question");
  });
});
