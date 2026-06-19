import { describe, it, expect } from "vitest";
import {
  SANDBOX_TABS, configRows, configToggleKey, dependencyRows,
  doctorGlyph, overrideRows, sandboxSummary,
} from "./sandbox-view.js";
import { sandboxState } from "../settings/sandbox.js";
import type { DoctorCheck } from "../settings/sandbox.js";

const base = sandboxState({}, {});

describe("sandbox-view — pure shaping", () => {
  it("exposes exactly the four tabs in order", () => {
    expect([...SANDBOX_TABS]).toEqual(["Config", "Dependencies", "Doctor", "Overrides"]);
  });

  it("configRows reflects the on/off flags", () => {
    const rows = configRows({ ...base, enabled: true });
    expect(rows[0]!.on).toBe(true);
    expect(rows[1]!.on).toBe(false);
    expect(rows).toHaveLength(3);
  });

  it("configToggleKey maps row index to the toggle key, null past the end", () => {
    expect(configToggleKey(0)).toBe("enabled");
    expect(configToggleKey(1)).toBe("shellOnly");
    expect(configToggleKey(2)).toBe("allowNetwork");
    expect(configToggleKey(3)).toBeNull();
  });

  it("dependencyRows passes through the package list", () => {
    expect(dependencyRows({ ...base, dependencies: ["ripgrep", "fd"] })).toEqual(["ripgrep", "fd"]);
  });

  it("doctorGlyph picks ✓/⚠/· by level", () => {
    const mk = (level: DoctorCheck["level"]): DoctorCheck => ({ label: "x", level, detail: "" });
    expect(doctorGlyph(mk("ok"))).toBe("✓");
    expect(doctorGlyph(mk("warn"))).toBe("⚠");
    expect(doctorGlyph(mk("info"))).toBe("·");
  });

  it("overrideRows attaches a direction glyph per rule", () => {
    const rows = overrideRows({ ...base, overrides: [{ tool: "git", rule: "bypass" }, { tool: "run_code", rule: "enforce" }] });
    expect(rows[0]).toEqual({ tool: "git", rule: "bypass", glyph: "↓" });
    expect(rows[1]).toEqual({ tool: "run_code", rule: "enforce", glyph: "↑" });
  });

  it("sandboxSummary reads off / mode parts", () => {
    expect(sandboxSummary(base)).toBe("off");
    expect(sandboxSummary({ ...base, enabled: true })).toBe("code-runners · net-off");
    expect(sandboxSummary({ ...base, shellOnly: true, allowNetwork: true })).toBe("shell · net-on");
  });
});
