import { describe, it, expect } from "vitest";
import {
  openMultiSelect,
  moveCursor,
  toggleChecked,
  setAll,
  chosenItems,
  formatMultiSelect,
  type MultiSelectState,
} from "./mcp-multiselect.js";

const SERVERS = ["server-a", "server-b", "server-c"];

describe("openMultiSelect", () => {
  it("starts at cursor 0 with nothing checked", () => {
    const state = openMultiSelect(SERVERS);
    expect(state.cursor).toBe(0);
    expect(state.checked.size).toBe(0);
    expect(state.items).toEqual(SERVERS);
  });

  it("honors preChecked indices", () => {
    const state = openMultiSelect(SERVERS, [0, 2]);
    expect(chosenItems(state)).toEqual(["server-a", "server-c"]);
  });

  it("ignores out-of-range and non-integer preChecked indices", () => {
    const state = openMultiSelect(SERVERS, [5, -1, 1.5, 1]);
    expect(chosenItems(state)).toEqual(["server-b"]);
  });

  it("copies the input array (does not retain the caller's reference)", () => {
    const input = [...SERVERS];
    const state = openMultiSelect(input);
    input.push("mutated");
    expect(state.items).toEqual(SERVERS);
  });

  it("empty items → empty selectable state", () => {
    const state = openMultiSelect([]);
    expect(state.items).toEqual([]);
    expect(state.cursor).toBe(0);
    expect(chosenItems(state)).toEqual([]);
  });
});

describe("moveCursor", () => {
  it("moves down within bounds", () => {
    const state = moveCursor(openMultiSelect(SERVERS), 1);
    expect(state.cursor).toBe(1);
  });

  it("clamps at the top (no wrap)", () => {
    const state = moveCursor(openMultiSelect(SERVERS), -1);
    expect(state.cursor).toBe(0);
  });

  it("clamps at the bottom (no wrap)", () => {
    const state = moveCursor(openMultiSelect(SERVERS), 99);
    expect(state.cursor).toBe(SERVERS.length - 1);
  });

  it("empty list keeps cursor at 0", () => {
    expect(moveCursor(openMultiSelect([]), 1).cursor).toBe(0);
    expect(moveCursor(openMultiSelect([]), -1).cursor).toBe(0);
  });

  it("does not mutate the input state", () => {
    const before = openMultiSelect(SERVERS);
    const snapshot: MultiSelectState = { ...before };
    moveCursor(before, 2);
    expect(before).toEqual(snapshot);
  });
});

describe("toggleChecked", () => {
  it("checks the cursor's item only", () => {
    const state = toggleChecked(moveCursor(openMultiSelect(SERVERS), 1));
    expect(chosenItems(state)).toEqual(["server-b"]);
  });

  it("toggles back off on a second call", () => {
    const once = toggleChecked(openMultiSelect(SERVERS));
    const twice = toggleChecked(once);
    expect(chosenItems(twice)).toEqual([]);
  });

  it("only affects the cursor item, leaving others untouched", () => {
    let state = toggleChecked(openMultiSelect(SERVERS)); // check a
    state = toggleChecked(moveCursor(state, 2)); // check c
    expect(chosenItems(state)).toEqual(["server-a", "server-c"]);
  });

  it("empty list → unchanged", () => {
    const empty = openMultiSelect([]);
    expect(toggleChecked(empty)).toBe(empty);
  });

  it("does not mutate the input state's checked set", () => {
    const before = openMultiSelect(SERVERS);
    toggleChecked(before);
    expect(before.checked.size).toBe(0);
  });
});

describe("setAll", () => {
  it("checks every item", () => {
    const state = setAll(openMultiSelect(SERVERS), true);
    expect(chosenItems(state)).toEqual(SERVERS);
  });

  it("unchecks every item", () => {
    const allOn = setAll(openMultiSelect(SERVERS), true);
    const allOff = setAll(allOn, false);
    expect(chosenItems(allOff)).toEqual([]);
  });

  it("empty list stays empty for either direction", () => {
    expect(chosenItems(setAll(openMultiSelect([]), true))).toEqual([]);
    expect(chosenItems(setAll(openMultiSelect([]), false))).toEqual([]);
  });

  it("does not mutate the input state", () => {
    const before = openMultiSelect(SERVERS);
    setAll(before, true);
    expect(before.checked.size).toBe(0);
  });
});

describe("chosenItems", () => {
  it("returns checked names in list order regardless of toggle order", () => {
    let state = toggleChecked(moveCursor(openMultiSelect(SERVERS), 2)); // c first
    state = toggleChecked(moveCursor(state, -2)); // then a
    expect(chosenItems(state)).toEqual(["server-a", "server-c"]);
  });

  it("returns [] when nothing is checked", () => {
    expect(chosenItems(openMultiSelect(SERVERS))).toEqual([]);
  });
});

describe("formatMultiSelect", () => {
  it("marks the cursor row and checkbox states", () => {
    const state = toggleChecked(openMultiSelect(SERVERS)); // cursor 0, a checked
    const out = formatMultiSelect(state);
    expect(out).toContain("▸ [x] server-a");
    expect(out).toContain("  [ ] server-b");
    expect(out).toContain("  [ ] server-c");
  });

  it("moves the cursor mark with the cursor", () => {
    const state = moveCursor(openMultiSelect(SERVERS), 1);
    const out = formatMultiSelect(state);
    expect(out).toContain("  [ ] server-a");
    expect(out).toContain("▸ [ ] server-b");
  });

  it("includes the key hint line", () => {
    const out = formatMultiSelect(openMultiSelect(SERVERS));
    expect(out).toContain("[space] toggle · [a] all · [enter] confirm");
  });

  it("empty items → placeholder", () => {
    expect(formatMultiSelect(openMultiSelect([]))).toBe("  (no servers)");
  });

  it("control-strips item names (no injected escapes survive)", () => {
    // ESC (27) + a CSI color code + a newline, built via String.fromCharCode so
    // the SOURCE carries no literal control byte.
    const ESC = String.fromCharCode(27);
    const evil = `evil${ESC}[31mname\nbreak`;
    const out = formatMultiSelect(openMultiSelect([evil]));
    expect(out).toContain("evilname break");
    // the server-name row must carry no C0/C1 control byte (ESC + the newline
    // inside the name were stripped). Inspect the row only — formatMultiSelect
    // legitimately joins rows with newlines.
    const evilRow = out.split("\n").find((l) => l.includes("evil")) ?? "";
    const CONTROL = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f]");
    expect(CONTROL.test(evilRow)).toBe(false);
    // newline in the name must not split the rendered list into extra rows
    expect(out.split("\n").filter((l) => l.includes("evil"))).toHaveLength(1);
  });
});
