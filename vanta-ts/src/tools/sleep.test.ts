import { describe, it, expect } from "vitest";
import { sleepTool } from "./sleep.js";

const ctx = { root: "/tmp", safety: {} as never, requestApproval: async () => true };

describe("sleepTool", () => {
  it("sleeps for the specified seconds", async () => {
    const start = Date.now();
    const result = await sleepTool.execute({ seconds: 0.1 }, ctx);
    const elapsed = Date.now() - start;

    expect(result.ok).toBe(true);
    expect(result.output).toContain("0.1s");
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });

  it("defaults to 1 second", async () => {
    const result = await sleepTool.execute({}, ctx);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("1s");
  });

  it("rejects invalid seconds", async () => {
    const result = await sleepTool.execute({ seconds: -1 }, ctx);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Invalid");
  });

  it("rejects seconds > 3600", async () => {
    const result = await sleepTool.execute({ seconds: 3601 }, ctx);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Invalid");
  });
});
