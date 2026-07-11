import { describe, it, expect } from "vitest";
import { isErrorResult, buildErrorDetectText, DEFAULT_ERRORDETECT_THRESHOLD } from "./error-detect.js";

describe("isErrorResult", () => {
  it("returns true when ok is false", () => {
    expect(isErrorResult(false, "something")).toBe(true);
  });

  it("returns false when ok is true and no error keywords", () => {
    expect(isErrorResult(true, "success output")).toBe(false);
  });

  it("detects error keywords in output even when ok is true", () => {
    expect(isErrorResult(true, "Error: file not found")).toBe(true);
    expect(isErrorResult(true, "ENOENT: no such file")).toBe(true);
    expect(isErrorResult(true, "command failed with exit code 1")).toBe(true);
  });

  it("does not treat successful policy or rollback prose as an error", () => {
    expect(isErrorResult(true, "Rollback on failure; this workflow cannot deploy without approval.")).toBe(false);
  });

  it("is case-insensitive for keyword detection", () => {
    expect(isErrorResult(true, "error in pipeline")).toBe(true);
    expect(isErrorResult(true, "Failed to connect")).toBe(true);
  });

  it("returns false for empty output (empty ≠ error)", () => {
    expect(isErrorResult(true, "")).toBe(false);
  });
});

describe("buildErrorDetectText", () => {
  it("includes the consecutive failure count", () => {
    const text = buildErrorDetectText(DEFAULT_ERRORDETECT_THRESHOLD);
    expect(text).toContain(String(DEFAULT_ERRORDETECT_THRESHOLD));
  });

  it("suggests reassessing the approach", () => {
    const text = buildErrorDetectText(3);
    expect(text).toMatch(/reassess|different approach|pause/i);
  });

  it("opens the self-repair loop when repeated failures hit the threshold", () => {
    const text = buildErrorDetectText(3);
    expect(text).toContain("Repair loop");
    expect(text).toContain("/compartments");
    expect(text).toContain("self_repair");
    expect(text).toContain("sandbox_test");
  });
});
