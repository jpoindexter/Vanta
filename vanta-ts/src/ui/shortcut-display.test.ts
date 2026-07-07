import { describe, it, expect } from "vitest";
import { shortcutFor } from "./shortcut-display.js";
import { DEFAULT_BINDINGS, GLOBAL_ACTIONS, resolveBindings } from "./keybindings.js";
import type { KeyBinding } from "./keybinding-warnings.js";

// VANTA-SHORTCUT-DISPLAY — the sync (non-React) variant. The React hook is
// exercised by help-panel.test.tsx / app-regions render tests.

describe("shortcutFor (sync variant for commands/services)", () => {
  it("returns the display chord for a bound action", () => {
    expect(shortcutFor(GLOBAL_ACTIONS.quickOpen, "global", DEFAULT_BINDINGS)).toBe("⌃P");
    expect(shortcutFor(GLOBAL_ACTIONS.exitOrAbort, "global", DEFAULT_BINDINGS)).toBe("⌃C");
    expect(shortcutFor(GLOBAL_ACTIONS.interrupt, "global", DEFAULT_BINDINGS)).toBe("escape");
  });

  it("reflects a user rebind (this is the whole point — hints match the config)", () => {
    const custom: KeyBinding[] = resolveBindings(DEFAULT_BINDINGS, [{ action: GLOBAL_ACTIONS.quickOpen, chord: "ctrl+k", context: "global" }]);
    expect(shortcutFor(GLOBAL_ACTIONS.quickOpen, "global", custom)).toBe("⌃K");
  });

  it("falls back to the provided fallback when unbound (never a blank hint)", () => {
    expect(shortcutFor("nope.missing", "global", DEFAULT_BINDINGS, "?")).toBe("?");
    expect(shortcutFor("nope.missing", "global", DEFAULT_BINDINGS)).toBe("");
  });

  it("resolves a context-specific binding, else the global fallback", () => {
    const b: KeyBinding[] = resolveBindings(DEFAULT_BINDINGS, [{ action: "app.save", chord: "ctrl+s", context: "composer" }]);
    expect(shortcutFor("app.save", "composer", b)).toBe("⌃S");
    expect(shortcutFor(GLOBAL_ACTIONS.quickOpen, "composer", b)).toBe("⌃P"); // global fallback
  });
});
