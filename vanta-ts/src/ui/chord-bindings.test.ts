import { describe, expect, it } from "vitest";
import { resolveChordInput } from "./chord-bindings.js";
import type { KeyBinding } from "./keybinding-warnings.js";

const bindings: KeyBinding[] = [
  { action: "open.settings", chord: "ctrl+k ctrl+s", context: "global" },
  { action: "open.files", chord: "ctrl+k ctrl+f", context: "global" },
  { action: "save", chord: "cmd+s", context: "global" },
  { action: "search.next", chord: "ctrl+k ctrl+n", context: "historySearch" },
  { action: "chat.next", chord: "ctrl+k ctrl+n", context: "chat" },
];

describe("resolveChordInput", () => {
  it("starts a pending chord for a partial sequence", () => {
    expect(resolveChordInput(bindings, "ctrl+k")).toMatchObject({
      kind: "chord_started",
      pending: "ctrl+k",
      message: expect.stringContaining("⌃K"),
    });
  });

  it("matches a complete multi-step chord sequence", () => {
    const first = resolveChordInput(bindings, "ctrl+k");
    expect(first.kind).toBe("chord_started");
    if (first.kind !== "chord_started") throw new Error("expected pending chord");
    expect(resolveChordInput(bindings, "ctrl+s", first.pending)).toEqual({
      kind: "match",
      action: "open.settings",
      chord: "ctrl+k ctrl+s",
    });
  });

  it("cancels an invalid followup without returning an action", () => {
    expect(resolveChordInput(bindings, "ctrl+x", "ctrl+k")).toMatchObject({
      kind: "chord_cancelled",
      pending: "ctrl+k",
      chord: "ctrl+x",
      message: expect.stringContaining("cancelled"),
    });
  });

  it("normalizes command/super aliases to meta", () => {
    expect(resolveChordInput(bindings, "super+s")).toEqual({
      kind: "match",
      action: "save",
      chord: "meta+s",
    });
  });

  it("prefers the first active context over lower-priority contexts and global", () => {
    const first = resolveChordInput(bindings, "ctrl+k", null, ["historySearch", "chat", "global"]);
    if (first.kind !== "chord_started") throw new Error("expected pending chord");
    expect(resolveChordInput(bindings, "ctrl+n", first.pending, ["historySearch", "chat", "global"])).toMatchObject({
      kind: "match",
      action: "search.next",
    });
  });
});
