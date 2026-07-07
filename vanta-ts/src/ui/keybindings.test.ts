import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_BINDINGS, GLOBAL_ACTIONS, normalizeChord, displayChord, resolveBindings,
  lookupChord, actionForChord, eventToChord, parseKeybindingConfig, loadKeybindings,
} from "./keybindings.js";
import type { KeyBinding } from "./keybinding-warnings.js";

// KEYBINDING-CUSTOMIZATION — config-driven, context-scoped, chord-capable bindings.

describe("normalizeChord / displayChord", () => {
  it("canonicalizes modifier order + case", () => {
    expect(normalizeChord("Shift+Ctrl+T")).toBe("ctrl+shift+t");
    expect(normalizeChord("ctrl+shift+t")).toBe(normalizeChord("SHIFT+CTRL+T"));
  });
  it("renders glyphs for display", () => {
    expect(displayChord("ctrl+shift+t")).toBe("⌃⇧T");
    expect(displayChord("escape")).toBe("escape");
  });
});

describe("resolveBindings (layering)", () => {
  it("a user override REPLACES a default's chord for the same action+context", () => {
    const overrides: KeyBinding[] = [{ action: GLOBAL_ACTIONS.quickOpen, chord: "ctrl+k", context: "global" }];
    const r = resolveBindings(DEFAULT_BINDINGS, overrides);
    expect(lookupChord(r, GLOBAL_ACTIONS.quickOpen)).toBe("ctrl+k"); // was ctrl+p
    expect(r.filter((b) => b.action === GLOBAL_ACTIONS.quickOpen)).toHaveLength(1); // replaced, not duplicated
  });
  it("a new action+context is ADDED after the defaults", () => {
    const r = resolveBindings(DEFAULT_BINDINGS, [{ action: "custom.thing", chord: "ctrl+j", context: "composer" }]);
    expect(lookupChord(r, "custom.thing", "composer")).toBe("ctrl+j");
    expect(r.length).toBe(DEFAULT_BINDINGS.length + 1);
  });
});

describe("lookupChord / actionForChord", () => {
  it("lookupChord falls back from a specific context to global", () => {
    const b: KeyBinding[] = [{ action: "a", chord: "ctrl+g", context: "global" }];
    expect(lookupChord(b, "a", "composer")).toBe("ctrl+g"); // global fallback
    expect(lookupChord(b, "missing")).toBeNull();
  });
  it("actionForChord resolves normalized chords, global fallback", () => {
    expect(actionForChord(DEFAULT_BINDINGS, "CTRL+P")).toBe(GLOBAL_ACTIONS.quickOpen);
    expect(actionForChord(DEFAULT_BINDINGS, "ctrl+z")).toBeNull();
  });
});

describe("eventToChord", () => {
  it("maps modifier+key and named keys; ignores bare printable keys", () => {
    expect(eventToChord("p", { ctrl: true })).toBe("ctrl+p");
    expect(eventToChord("", { escape: true })).toBe("escape");
    expect(eventToChord("", { shift: true, rightArrow: true })).toBe("shift+right");
    expect(eventToChord("a", {})).toBeNull(); // bare typing, not a chord
  });
});

describe("parseKeybindingConfig / loadKeybindings", () => {
  let home: string;
  beforeEach(async () => { home = await mkdtemp(join(tmpdir(), "vanta-kb-")); });
  afterEach(() => { /* temp home */ });

  it("rejects junk / wrong version", () => {
    expect(parseKeybindingConfig({ version: 2, bindings: [] })).toBeNull();
    expect(parseKeybindingConfig("nope")).toBeNull();
  });

  it("loads + layers a user config over defaults; missing file → defaults", async () => {
    const env = { VANTA_HOME: home };
    expect(await loadKeybindings(env)).toEqual(DEFAULT_BINDINGS); // no file
    await mkdir(home, { recursive: true });
    await writeFile(join(home, "keybindings.json"), JSON.stringify({ version: 1, bindings: [{ action: GLOBAL_ACTIONS.quickOpen, chord: "ctrl+k", context: "global" }] }), "utf8");
    const loaded = await loadKeybindings(env);
    expect(lookupChord(loaded, GLOBAL_ACTIONS.quickOpen)).toBe("ctrl+k"); // hot-reloaded override
  });

  it("a corrupt config falls back to defaults (never wedges input)", async () => {
    await mkdir(home, { recursive: true });
    await writeFile(join(home, "keybindings.json"), "{broken", "utf8");
    expect(await loadKeybindings({ VANTA_HOME: home })).toEqual(DEFAULT_BINDINGS);
  });
});
