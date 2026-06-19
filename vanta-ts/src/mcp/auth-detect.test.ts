import { describe, it, expect } from "vitest";
import { isAuthRequiredError } from "./auth-detect.js";

describe("isAuthRequiredError", () => {
  it("detects HTTP 401 from the http transport's error message", () => {
    expect(isAuthRequiredError(new Error("HTTP 401: Unauthorized"))).toBe(true);
  });

  it("detects HTTP 403", () => {
    expect(isAuthRequiredError(new Error("HTTP 403: Forbidden"))).toBe(true);
  });

  it("detects WWW-Authenticate / OAuth phrasings", () => {
    expect(isAuthRequiredError(new Error("WWW-Authenticate: Bearer"))).toBe(true);
    expect(isAuthRequiredError(new Error("authentication required"))).toBe(true);
    expect(isAuthRequiredError(new Error("invalid_token"))).toBe(true);
    expect(isAuthRequiredError(new Error("OAuth consent needed"))).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isAuthRequiredError(new Error("UNAUTHORIZED"))).toBe(true);
  });

  it("does not flag unrelated failures", () => {
    expect(isAuthRequiredError(new Error("mcp server exited (1)"))).toBe(false);
    expect(isAuthRequiredError(new Error("HTTP 500: Internal Server Error"))).toBe(false);
    expect(isAuthRequiredError(new Error("ECONNREFUSED"))).toBe(false);
  });

  it("handles non-Error values without throwing", () => {
    expect(isAuthRequiredError("401 unauthorized")).toBe(true);
    expect(isAuthRequiredError(undefined)).toBe(false);
    expect(isAuthRequiredError(null)).toBe(false);
  });
});
