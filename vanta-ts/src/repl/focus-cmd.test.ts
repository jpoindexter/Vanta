import { describe, it, expect } from "vitest";
import { focusCommand } from "./focus-cmd.js";

const ctx = {} as never;

describe("focusCommand (/focus)", () => {
  it("returns toggleFocusMode: true", async () => {
    const r = await focusCommand("", ctx);
    expect(r.toggleFocusMode).toBe(true);
  });

  it("returns a user-facing output message", async () => {
    const r = await focusCommand("", ctx);
    expect(typeof r.output).toBe("string");
    expect(r.output!.length).toBeGreaterThan(0);
  });

  it("ignores arguments (always toggles)", async () => {
    const r = await focusCommand("on", ctx);
    expect(r.toggleFocusMode).toBe(true);
  });
});
