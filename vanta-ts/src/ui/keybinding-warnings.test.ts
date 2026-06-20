import { describe, it, expect } from "vitest";
import {
  findKeybindingConflicts,
  buildConflictWarning,
  hasConflicts,
  GLOBAL_CONTEXT,
  type KeyBinding,
} from "./keybinding-warnings.js";

const b = (action: string, chord: string, context: string): KeyBinding => ({ action, chord, context });

describe("findKeybindingConflicts", () => {
  it("returns [] when there are no conflicts", () => {
    const bindings = [
      b("palette.next", "down", "palette"),
      b("composer.submit", "return", "composer"),
      b("global.quit", "ctrl+c", GLOBAL_CONTEXT),
    ];
    expect(findKeybindingConflicts(bindings)).toEqual([]);
    expect(hasConflicts(bindings)).toBe(false);
  });

  it("flags two actions on the SAME chord in the SAME context as a conflict", () => {
    const bindings = [
      b("transcript.toggleExpand", "ctrl+t", "transcript"),
      b("transcript.copy", "ctrl+t", "transcript"),
    ];
    const conflicts = findKeybindingConflicts(bindings);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      chord: "ctrl+t",
      context: "transcript",
      kind: "conflict",
    });
    expect(conflicts[0]!.actions.sort()).toEqual(["transcript.copy", "transcript.toggleExpand"]);
    expect(hasConflicts(bindings)).toBe(true);
  });

  it("does NOT flag the same chord in DIFFERENT specific contexts", () => {
    const bindings = [
      b("palette.next", "ctrl+n", "palette"),
      b("composer.newline", "ctrl+n", "composer"),
    ];
    expect(findKeybindingConflicts(bindings)).toEqual([]);
    expect(hasConflicts(bindings)).toBe(false);
  });

  it("flags a global + specific binding on the same chord as a shadow (lower severity)", () => {
    const bindings = [
      b("global.help", "ctrl+h", GLOBAL_CONTEXT),
      b("composer.backspaceWord", "ctrl+h", "composer"),
    ];
    const conflicts = findKeybindingConflicts(bindings);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      chord: "ctrl+h",
      context: "composer",
      kind: "shadow",
    });
    // shadower first, shadowed global second
    expect(conflicts[0]!.actions).toEqual(["composer.backspaceWord", "global.help"]);
  });

  it("orders same-context conflicts before shadows", () => {
    const bindings = [
      b("global.help", "ctrl+h", GLOBAL_CONTEXT),
      b("composer.backspaceWord", "ctrl+h", "composer"),
      b("transcript.a", "ctrl+t", "transcript"),
      b("transcript.b", "ctrl+t", "transcript"),
    ];
    const conflicts = findKeybindingConflicts(bindings);
    expect(conflicts).toHaveLength(2);
    expect(conflicts[0]!.kind).toBe("conflict");
    expect(conflicts[1]!.kind).toBe("shadow");
  });

  it("treats a duplicate binding (same action, chord, context) as redundant, not a conflict", () => {
    const bindings = [
      b("palette.next", "down", "palette"),
      b("palette.next", "down", "palette"),
    ];
    expect(findKeybindingConflicts(bindings)).toEqual([]);
  });

  it("does not shadow a global chord against itself in the global context", () => {
    const bindings = [
      b("global.quit", "ctrl+c", GLOBAL_CONTEXT),
      b("global.quit", "ctrl+c", GLOBAL_CONTEXT),
    ];
    // duplicate global binding → redundant, not a conflict; never a self-shadow
    expect(findKeybindingConflicts(bindings)).toEqual([]);
  });

  it("flags three actions on one chord+context with all of them listed", () => {
    const bindings = [
      b("a", "ctrl+x", "modal"),
      b("b", "ctrl+x", "modal"),
      b("c", "ctrl+x", "modal"),
    ];
    const conflicts = findKeybindingConflicts(bindings);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.actions.sort()).toEqual(["a", "b", "c"]);
  });

  it("emits one shadow note per specific context shadowing the same global chord", () => {
    const bindings = [
      b("global.find", "ctrl+f", GLOBAL_CONTEXT),
      b("composer.forward", "ctrl+f", "composer"),
      b("transcript.find", "ctrl+f", "transcript"),
    ];
    const conflicts = findKeybindingConflicts(bindings);
    expect(conflicts).toHaveLength(2);
    expect(conflicts.every((c) => c.kind === "shadow")).toBe(true);
    expect(conflicts.map((c) => c.context).sort()).toEqual(["composer", "transcript"]);
  });
});

describe("buildConflictWarning", () => {
  it("names both actions, the context, and the resolution file for a conflict", () => {
    const [conflict] = findKeybindingConflicts([
      b("transcript.toggleExpand", "ctrl+t", "transcript"),
      b("transcript.copy", "ctrl+t", "transcript"),
    ]);
    const msg = buildConflictWarning(conflict!);
    expect(msg).toContain("ctrl+t");
    expect(msg).toContain("transcript");
    expect(msg).toContain("transcript.toggleExpand");
    expect(msg).toContain("transcript.copy");
    expect(msg).toContain("~/.vanta/keybindings.json");
    expect(msg).toContain("rebind");
  });

  it("describes a shadow as shadowing the global binding", () => {
    const [conflict] = findKeybindingConflicts([
      b("global.help", "ctrl+h", GLOBAL_CONTEXT),
      b("composer.backspaceWord", "ctrl+h", "composer"),
    ]);
    const msg = buildConflictWarning(conflict!);
    expect(msg).toContain("ctrl+h");
    expect(msg).toContain("composer");
    expect(msg).toContain("composer.backspaceWord");
    expect(msg).toContain("global.help");
    expect(msg).toContain("shadows the global binding");
    expect(msg).toContain("~/.vanta/keybindings.json");
  });

  it("joins three conflicting actions readably", () => {
    const [conflict] = findKeybindingConflicts([
      b("a", "ctrl+x", "modal"),
      b("b", "ctrl+x", "modal"),
      b("c", "ctrl+x", "modal"),
    ]);
    const msg = buildConflictWarning(conflict!);
    expect(msg).toContain("a, b and c");
  });
});

describe("hasConflicts", () => {
  it("is false for an empty binding list", () => {
    expect(hasConflicts([])).toBe(false);
  });
});
