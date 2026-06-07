import { describe, it, expect } from "vitest";
import { detectMode, buildModeHint } from "./mode-detect.js";

describe("detectMode", () => {
  it("maps imperatives to the silent executor", () => {
    expect(detectMode("just do it")).toBe("silent-executor");
    expect(detectMode("go ahead and implement the parser")).toBe("silent-executor");
  });

  it("maps deliberation to collaborator", () => {
    expect(detectMode("what do you think about using zod here?")).toBe("collaborator");
    expect(detectMode("should we split this file?")).toBe("collaborator");
  });

  it("maps review asks to critic", () => {
    expect(detectMode("review this function")).toBe("critic");
    expect(detectMode("what's wrong with my approach")).toBe("critic");
  });

  it("maps investigation to researcher", () => {
    expect(detectMode("research the best rate-limiting strategy")).toBe("researcher");
  });

  it("maps failures to debugger", () => {
    expect(detectMode("this is failing with a stack trace")).toBe("debugger");
    expect(detectMode("the build is broken")).toBe("debugger");
  });

  it("falls back to assistant for neutral input", () => {
    expect(detectMode("add a license header to README")).toBe("assistant");
  });

  it("prefers a specific stance over the executor when both could match", () => {
    // "fix it" (executor) but it's a failure → debugger wins (listed first)
    expect(detectMode("the test is failing, fix it")).toBe("debugger");
  });
});

describe("buildModeHint", () => {
  it("returns a stance hint for a detected mode", () => {
    expect(buildModeHint("just do it")).toContain("silent executor");
  });

  it("returns null for the neutral default (no injection)", () => {
    expect(buildModeHint("add a license header to README")).toBeNull();
  });
});
