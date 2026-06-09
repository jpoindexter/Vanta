import { describe, it, expect } from "vitest";
import { screenToTask, buildScreenPrompt } from "./screen-to-task.js";

describe("screenToTask", () => {
  it("detects errors as high confidence", () => {
    const t = screenToTask("TypeError: Cannot read property 'map' of undefined\nat app.ts:42");
    expect(t.confidence).toBe("high");
    expect(t.title.toLowerCase()).toContain("error");
  });

  it("detects failing tests", () => {
    const t = screenToTask("3 tests failed ❌ — auth.test.ts and session.test.ts");
    expect(t.confidence).toBe("high");
    expect(t.title.toLowerCase()).toContain("test");
  });

  it("detects PR review state", () => {
    const t = screenToTask("Pull request: changes requested by reviewer. Open PR #42");
    expect(t.confidence).toBe("high");
    expect(t.title.toLowerCase()).toContain("pr");
  });

  it("detects empty state", () => {
    const t = screenToTask("Nothing to show yet. Getting started? Add your first item.");
    expect(t.confidence).toBe("medium");
    expect(t.title.toLowerCase()).toMatch(/set up|add|first/);
  });

  it("returns low-confidence review for unknown screens", () => {
    const t = screenToTask("A dashboard with some charts and numbers.");
    expect(t.confidence).toBe("low");
  });

  it("always returns non-empty title and why", () => {
    const cases = ["", "random text", "Error in foo", "tests failed", "review requested"];
    for (const c of cases) {
      const t = screenToTask(c);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.why.length).toBeGreaterThan(0);
    }
  });
});

describe("buildScreenPrompt", () => {
  it("contains vision guidance keywords", () => {
    const p = buildScreenPrompt();
    expect(p).toContain("screen");
    expect(p).toContain("error");
  });
});
