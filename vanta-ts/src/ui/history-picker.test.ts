import { describe, it, expect } from "vitest";
import {
  filterHistory,
  openHistoryPicker,
  updateQuery,
  moveSelection,
  selectedEntry,
  formatHistoryPicker,
  MAX_HISTORY_RESULTS,
  type HistoryPickerState,
} from "./history-picker.js";

// History is stored oldest→newest (the composer pushes the newest input last).
const HISTORY = ["git status", "git commit", "npm test", "git push"];

// Explicit-codepoint control-char detector — no literal control bytes in the source.
// The newline U+000A is the only legitimate control char in a rendered overlay block,
// so it's excluded; everything else in the C0/C1 + DEL ranges must be stripped.
const CONTROL_NO_NEWLINE = new RegExp("[\\u0000-\\u0009\\u000b-\\u001f\\u007f-\\u009f]");

describe("filterHistory", () => {
  it("empty query returns recent history, most-recent first", () => {
    expect(filterHistory(HISTORY, "")).toEqual(["git push", "npm test", "git commit", "git status"]);
  });

  it("treats a whitespace-only query as empty (recent-first)", () => {
    expect(filterHistory(HISTORY, "   ")).toEqual(["git push", "npm test", "git commit", "git status"]);
  });

  it("no history → empty list", () => {
    expect(filterHistory([], "")).toEqual([]);
    expect(filterHistory([], "anything")).toEqual([]);
  });

  it("filters to case-insensitive substring matches", () => {
    const out = filterHistory(HISTORY, "GIT");
    expect(out).toEqual(["git push", "git commit", "git status"]);
    expect(out).not.toContain("npm test");
  });

  it("ranks starts-with above contains", () => {
    const entries = ["run a git command", "git status"];
    // Both contain "git"; only "git status" starts with it → it ranks first.
    expect(filterHistory(entries, "git")).toEqual(["git status", "run a git command"]);
  });

  it("breaks rank ties by recency (more-recent first)", () => {
    // All three start with "git" → tie on rank → newest original entry wins.
    expect(filterHistory(HISTORY, "git")).toEqual(["git push", "git commit", "git status"]);
  });

  it("dedupes consecutive duplicate inputs", () => {
    const entries = ["ls", "ls", "ls", "cd", "ls"];
    // Consecutive "ls" runs collapse; the non-consecutive trailing "ls" stays.
    expect(filterHistory(entries, "")).toEqual(["ls", "cd", "ls"]);
  });

  it("returns no matches when nothing contains the query", () => {
    expect(filterHistory(HISTORY, "zzz")).toEqual([]);
  });

  it("caps results at MAX_HISTORY_RESULTS", () => {
    const many = Array.from({ length: 50 }, (_, i) => `cmd ${i}`);
    expect(filterHistory(many, "")).toHaveLength(MAX_HISTORY_RESULTS);
    expect(filterHistory(many, "cmd")).toHaveLength(MAX_HISTORY_RESULTS);
  });
});

describe("openHistoryPicker", () => {
  it("starts with an empty query, the recent-first filtered view, and the top row selected", () => {
    const state = openHistoryPicker(HISTORY);
    expect(state.query).toBe("");
    expect(state.filtered).toEqual(["git push", "npm test", "git commit", "git status"]);
    expect(state.selectedIndex).toBe(0);
  });

  it("no history → empty filtered list", () => {
    expect(openHistoryPicker([]).filtered).toEqual([]);
  });
});

describe("updateQuery", () => {
  it("re-filters and resets the selection to 0", () => {
    const start = moveSelection(openHistoryPicker(HISTORY), 2); // selectedIndex now 2
    expect(start.selectedIndex).toBe(2);
    const next = updateQuery(start, "git");
    expect(next.query).toBe("git");
    expect(next.filtered).toEqual(["git push", "git commit", "git status"]);
    expect(next.selectedIndex).toBe(0);
  });

  it("clearing the query restores the recent-first view", () => {
    const filtered = updateQuery(openHistoryPicker(HISTORY), "npm");
    expect(filtered.filtered).toEqual(["npm test"]);
    const cleared = updateQuery(filtered, "");
    expect(cleared.filtered).toEqual(["git push", "npm test", "git commit", "git status"]);
  });
});

describe("moveSelection", () => {
  const base = openHistoryPicker(HISTORY); // 4 filtered rows, selectedIndex 0

  it("moves down by the delta", () => {
    expect(moveSelection(base, 1).selectedIndex).toBe(1);
    expect(moveSelection(base, 3).selectedIndex).toBe(3);
  });

  it("clamps at the bottom (no wrap past the end)", () => {
    expect(moveSelection(base, 99).selectedIndex).toBe(3);
  });

  it("clamps at the top (no wrap past the start)", () => {
    expect(moveSelection(base, -5).selectedIndex).toBe(0);
    const atBottom = moveSelection(base, 3);
    expect(moveSelection(atBottom, -1).selectedIndex).toBe(2);
  });

  it("keeps the index at 0 for an empty list", () => {
    const empty = openHistoryPicker([]);
    expect(moveSelection(empty, 1).selectedIndex).toBe(0);
    expect(moveSelection(empty, -1).selectedIndex).toBe(0);
  });
});

describe("selectedEntry", () => {
  it("returns the entry at the selected index", () => {
    const state = moveSelection(openHistoryPicker(HISTORY), 2);
    expect(selectedEntry(state)).toBe("git commit");
  });

  it("returns null when the filtered list is empty", () => {
    expect(selectedEntry(openHistoryPicker([]))).toBeNull();
    expect(selectedEntry(updateQuery(openHistoryPicker(HISTORY), "zzz"))).toBeNull();
  });
});

describe("formatHistoryPicker", () => {
  it("marks the selected row with ▶ and the rest with spaces", () => {
    const state = moveSelection(openHistoryPicker(HISTORY), 1);
    const out = formatHistoryPicker(state);
    expect(out).toContain("▶ npm test");
    expect(out).toContain("  git push");
    expect(out).toContain("  git commit");
  });

  it("shows the query line", () => {
    const out = formatHistoryPicker(updateQuery(openHistoryPicker(HISTORY), "git"));
    expect(out).toContain("history › git");
  });

  it("shows a clear no-history line when the filtered list is empty", () => {
    expect(formatHistoryPicker(openHistoryPicker([]))).toContain("(no history)");
    const noMatch = updateQuery(openHistoryPicker(HISTORY), "zzz");
    expect(formatHistoryPicker(noMatch)).toContain("(no history)");
  });

  it("strips ANSI escapes from entries (no escape injection into the overlay)", () => {
    const ESC = String.fromCharCode(27);
    const BEL = String.fromCharCode(7);
    const malicious = `${ESC}[31mDANGER${ESC}[2J payload ${ESC}]0;title${BEL}`;
    const state: HistoryPickerState = {
      entries: [malicious],
      query: "",
      filtered: [malicious],
      selectedIndex: 0,
    };
    const out = formatHistoryPicker(state);
    expect(out).not.toContain(ESC);
    expect(out).not.toContain("[31m");
    expect(out).not.toContain("[2J");
    expect(out).not.toContain("0;title");
    expect(out).toContain("payload");
  });

  it("strips bare control characters from entries", () => {
    const NUL = String.fromCharCode(0);
    const BS = String.fromCharCode(8);
    const dirty = `a${NUL}b${BS}c`;
    const state: HistoryPickerState = {
      entries: [dirty],
      query: "",
      filtered: [dirty],
      selectedIndex: 0,
    };
    const out = formatHistoryPicker(state);
    expect(CONTROL_NO_NEWLINE.test(out)).toBe(false);
  });

  it("sanitizes the echoed query so it cannot inject escapes", () => {
    const ESC = String.fromCharCode(27);
    const out = formatHistoryPicker(updateQuery(openHistoryPicker(["x"]), `${ESC}[31mevil${ESC}[0m`));
    expect(out).not.toContain(ESC);
    expect(out).toContain("evil");
  });
});
