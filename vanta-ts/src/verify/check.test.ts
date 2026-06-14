import { describe, it, expect } from "vitest";
import { evaluateOutput, gradeRun, formatLock, formatCheckReport } from "./check.js";
import type { Lock } from "./store.js";

const lock: Lock = {
  id: "build-green",
  claim: "build passes",
  command: "npm run build",
  expect: "compiled",
  status: "passing",
  created: 0,
  updated: 0,
};

describe("evaluateOutput", () => {
  it("passes when the substring is present, fails when absent", () => {
    expect(evaluateOutput("compiled", "✓ compiled ok")).toBe(true);
    expect(evaluateOutput("compiled", "build failed")).toBe(false);
  });
});

describe("gradeRun", () => {
  it("is passing on exit 0 + substring present", () => {
    const r = gradeRun(lock, { exitCode: 0, output: "all compiled fine" });
    expect(r.status).toBe("passing");
  });

  it("is regressed when the substring vanished", () => {
    const r = gradeRun(lock, { exitCode: 0, output: "all good" });
    expect(r.status).toBe("regressed");
    expect(r.detail).toContain("no longer contains");
  });

  it("is regressed on a non-zero exit even if the substring appears", () => {
    const r = gradeRun(lock, { exitCode: 2, output: "compiled, then crashed" });
    expect(r.status).toBe("regressed");
    expect(r.detail).toContain("exited 2");
  });
});

describe("formatLock + formatCheckReport", () => {
  it("marks regressed locks with ✘ and a count in the header", () => {
    const report = formatCheckReport([
      { id: "a", claim: "x", status: "passing", detail: "ok" },
      { id: "b", claim: "y", status: "regressed", detail: "gone" },
    ]);
    expect(report).toContain("⚠ 1/2");
    expect(report).toContain("✘ b");
    expect(report).toContain("✓ a");
  });

  it("reports all-passing cleanly", () => {
    const report = formatCheckReport([{ id: "a", claim: "x", status: "passing", detail: "ok" }]);
    expect(report).toContain("All 1 lock(s) passing");
  });

  it("handles an empty check run", () => {
    expect(formatCheckReport([])).toContain("No regression locks");
  });

  it("renders a locked (unchecked) lock with the · glyph", () => {
    expect(formatLock({ id: "z", claim: "c", status: "locked" })).toContain("· z");
  });
});
