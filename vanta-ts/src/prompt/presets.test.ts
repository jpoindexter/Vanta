import { describe, expect, it } from "vitest";
import {
  activePromptPresetName,
  applyPromptPreset,
  PROMPT_PRESET_END,
  removePromptPreset,
  validatePromptPreset,
} from "./presets.js";

describe("prompt presets", () => {
  it("replaces only the prior preset block and preserves other live prompt additions", () => {
    const base = "Vanta base\n\nNew standing goal: finish docs";
    const first = applyPromptPreset(base, { name: "reviewer", content: "Review carefully." });
    const second = applyPromptPreset(first, { name: "builder", content: "Build and verify." });
    expect(second).toContain("Vanta base");
    expect(second).toContain("New standing goal");
    expect(second).toContain("Build and verify.");
    expect(second).not.toContain("Review carefully.");
    expect(activePromptPresetName(second)).toBe("builder");
  });

  it("resets to the exact non-preset prompt", () => {
    const base = "base prompt\n\n<!-- plan-first-mode -->";
    expect(removePromptPreset(applyPromptPreset(base, { name: "plan", content: "Plan only." }))).toBe(base);
  });

  it("rejects empty, oversized, multiline-name, and marker-injection presets", () => {
    expect(validatePromptPreset({ name: "x", content: "" })).toContain("empty");
    expect(validatePromptPreset({ name: "x\ny", content: "ok" })).toContain("one line");
    expect(validatePromptPreset({ name: "x", content: PROMPT_PRESET_END })).toContain("reserved marker");
    expect(validatePromptPreset({ name: "x", content: "x".repeat(32_001) })).toContain("exceeds");
  });
});
