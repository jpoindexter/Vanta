import { describe, it, expect } from "vitest";
import type { Message } from "../types.js";
import {
  openSelector,
  moveCursor,
  toggleAnchor,
  selectedIndices,
  exportSelection,
  formatSelector,
} from "./msg-selector.js";

const MESSAGES: Message[] = [
  { role: "system", content: "you are vanta" },
  { role: "user", content: "build the selector" },
  { role: "assistant", content: "done — here it is" },
  { role: "user", content: "now copy it" },
  { role: "assistant", content: "copied" },
];

describe("openSelector", () => {
  it("starts at cursor 0 with no anchor", () => {
    expect(openSelector(5)).toEqual({ count: 5, cursor: 0, anchor: null });
  });

  it("treats a non-positive or non-finite count as an empty list", () => {
    expect(openSelector(0)).toEqual({ count: 0, cursor: 0, anchor: null });
    expect(openSelector(-3)).toEqual({ count: 0, cursor: 0, anchor: null });
    expect(openSelector(Number.NaN)).toEqual({ count: 0, cursor: 0, anchor: null });
  });

  it("floors a fractional count", () => {
    expect(openSelector(3.9).count).toBe(3);
  });
});

describe("moveCursor", () => {
  it("moves down within bounds", () => {
    const s = moveCursor(openSelector(5), 2);
    expect(s.cursor).toBe(2);
  });

  it("clamps at the bottom (no wrap)", () => {
    const s = moveCursor(openSelector(3), 99);
    expect(s.cursor).toBe(2);
  });

  it("clamps at the top (no wrap)", () => {
    const s = moveCursor(openSelector(3), -99);
    expect(s.cursor).toBe(0);
  });

  it("keeps the cursor at 0 for an empty list", () => {
    const s = moveCursor(openSelector(0), 5);
    expect(s.cursor).toBe(0);
  });

  it("does not mutate the input state", () => {
    const before = openSelector(5);
    moveCursor(before, 3);
    expect(before.cursor).toBe(0);
  });
});

describe("toggleAnchor", () => {
  it("sets the anchor at the current cursor", () => {
    const s = toggleAnchor(moveCursor(openSelector(5), 2));
    expect(s.anchor).toBe(2);
  });

  it("clears the anchor on a second toggle", () => {
    const s = toggleAnchor(toggleAnchor(moveCursor(openSelector(5), 2)));
    expect(s.anchor).toBeNull();
  });

  it("never sets an anchor on an empty list", () => {
    expect(toggleAnchor(openSelector(0)).anchor).toBeNull();
  });
});

describe("selectedIndices", () => {
  it("is just the cursor when there is no anchor", () => {
    const s = moveCursor(openSelector(5), 3);
    expect(selectedIndices(s)).toEqual([3]);
  });

  it("is the inclusive range when an anchor is set (cursor below anchor)", () => {
    // anchor at 1, then move cursor down to 3 → 1..3
    const anchored = toggleAnchor(moveCursor(openSelector(5), 1));
    const ranged = moveCursor(anchored, 2);
    expect(selectedIndices(ranged)).toEqual([1, 2, 3]);
  });

  it("is the inclusive range in the reverse direction (cursor above anchor)", () => {
    // anchor at 3, then move cursor up to 1 → still 1..3
    const anchored = toggleAnchor(moveCursor(openSelector(5), 3));
    const ranged = moveCursor(anchored, -2);
    expect(selectedIndices(ranged)).toEqual([1, 2, 3]);
  });

  it("is a single index when the anchor equals the cursor", () => {
    const anchored = toggleAnchor(moveCursor(openSelector(5), 2));
    expect(selectedIndices(anchored)).toEqual([2]);
  });

  it("is empty for an empty list", () => {
    expect(selectedIndices(openSelector(0))).toEqual([]);
  });
});

describe("exportSelection", () => {
  it("joins selected messages with role prefixes and blank lines", () => {
    const out = exportSelection(MESSAGES, [1, 2]);
    expect(out).toBe("[user] build the selector\n\n[assistant] done — here it is");
  });

  it("skips system messages even when selected", () => {
    const out = exportSelection(MESSAGES, [0, 1]);
    expect(out).toBe("[user] build the selector");
  });

  it("control-strips message content (newlines, tabs, ANSI)", () => {
    //  = ESC; the CSI color codes must be stripped, newline/tab → space.
    const ansi = "line one\nline\ttwo [31mred[0m";
    const dirty: Message[] = [{ role: "user", content: ansi }];
    expect(exportSelection(dirty, [0])).toBe("[user] line one line two red");
  });

  it("ignores out-of-range indices", () => {
    const out = exportSelection(MESSAGES, [1, 99]);
    expect(out).toBe("[user] build the selector");
  });

  it("returns an empty string for an empty selection", () => {
    expect(exportSelection(MESSAGES, [])).toBe("");
  });

  it("returns an empty string when only system messages are selected", () => {
    expect(exportSelection(MESSAGES, [0])).toBe("");
  });

  it("exports a full range end-to-end", () => {
    const anchored = toggleAnchor(moveCursor(openSelector(MESSAGES.length), 1));
    const ranged = moveCursor(anchored, 2);
    const out = exportSelection(MESSAGES, selectedIndices(ranged));
    expect(out).toBe(
      "[user] build the selector\n\n[assistant] done — here it is\n\n[user] now copy it",
    );
  });
});

describe("formatSelector", () => {
  it("marks the cursor row with ▸ and selected rows with ✓", () => {
    const anchored = toggleAnchor(moveCursor(openSelector(MESSAGES.length), 1));
    const ranged = moveCursor(anchored, 1); // cursor 2, anchor 1 → 1..2 selected
    const out = formatSelector(MESSAGES, ranged);
    const lines = out.split("\n");
    expect(lines[0]).toBe("    [system] you are vanta"); // not cursor, not selected
    expect(lines[1]).toBe("  ✓ [user] build the selector"); // selected, not cursor
    expect(lines[2]).toBe("▸ ✓ [assistant] done — here it is"); // cursor + selected
  });

  it("marks only the cursor row when there is no anchor", () => {
    const s = moveCursor(openSelector(MESSAGES.length), 2);
    const lines = formatSelector(MESSAGES, s).split("\n");
    expect((lines[2] ?? "").startsWith("▸ ✓")).toBe(true);
    expect((lines[1] ?? "").startsWith("   ")).toBe(true);
    expect((lines[1] ?? "").includes("✓")).toBe(false);
  });

  it("clips a long preview", () => {
    const long: Message[] = [{ role: "user", content: "x".repeat(200) }];
    const line = formatSelector(long, openSelector(1));
    expect(line.endsWith("…")).toBe(true);
    expect(line.length).toBeLessThan(100);
  });

  it("shows a placeholder for an empty list", () => {
    expect(formatSelector([], openSelector(0))).toBe("  (no messages)");
  });
});
