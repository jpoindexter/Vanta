import { describe, expect, it } from "vitest";
import { SHELL_HOOK_EVENTS } from "./shell-hooks.js";
import {
  flattenPaperHookEvents,
  hookParitySummary,
  missingPaperHookEvents,
  paperHookCoverage,
  vantaExtraHookEvents,
} from "./paper-events.js";

describe("paper hook event parity", () => {
  it("captures the paper's 27 hook events", () => {
    const events = flattenPaperHookEvents();
    expect(events).toHaveLength(27);
    expect(new Set(events).size).toBe(27);
  });

  it("Vanta supports every paper hook event", () => {
    expect(missingPaperHookEvents()).toEqual([]);
    for (const row of paperHookCoverage()) {
      expect(row.supported).toEqual(row.paper);
      expect(row.missing).toEqual([]);
    }
  });

  it("names Vanta-native hook events beyond the paper map", () => {
    expect(vantaExtraHookEvents()).toEqual([
      "UserPromptExpansion",
      "MessageDisplay",
      "PostToolBatch",
    ]);
    expect(SHELL_HOOK_EVENTS).toHaveLength(30);
  });

  it("formats a compact parity summary", () => {
    expect(hookParitySummary()).toBe(
      "paper_events=27 vanta_events=30 missing=none vanta_extra=UserPromptExpansion,MessageDisplay,PostToolBatch",
    );
  });
});
