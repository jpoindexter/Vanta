import { describe, it, expect } from "vitest";
import { parseAlignments, wrapCell, padAligned, columnWidths, layoutTable } from "./markdown-table.js";

// VANTA-MARKDOWN-TABLES — pure GFM table layout: borders, alignment, wrap.

describe("parseAlignments", () => {
  it("reads left/right/center directives, defaulting to left", () => {
    expect(parseAlignments([":---", "---:", ":--:", "---"], 4)).toEqual(["left", "right", "center", "left"]);
  });
  it("pads to the column count when the sep row is short", () => {
    expect(parseAlignments(["---:"], 3)).toEqual(["right", "left", "left"]);
  });
});

describe("padAligned", () => {
  it("pads left/right/center within the width", () => {
    expect(padAligned("ab", 6, "left")).toBe("ab    ");
    expect(padAligned("ab", 6, "right")).toBe("    ab");
    expect(padAligned("ab", 6, "center")).toBe("  ab  ");
  });
  it("respects an empty cell", () => {
    expect(padAligned("", 3, "left")).toBe("   ");
  });
});

describe("wrapCell", () => {
  it("wraps on word boundaries within the width", () => {
    expect(wrapCell("the quick brown fox", 9)).toEqual(["the quick", "brown fox"]);
  });
  it("hard-splits a word longer than the width", () => {
    expect(wrapCell("supercalifragilistic", 5)).toEqual(["super", "calif", "ragil", "istic"]);
  });
  it("empty text → one empty line", () => {
    expect(wrapCell("", 5)).toEqual([""]);
  });
});

describe("columnWidths", () => {
  it("is the max of header + data, capped", () => {
    expect(columnWidths(["h"], [["longer cell"]], 40)).toEqual(["longer cell".length]);
    expect(columnWidths(["h"], [["x".repeat(100)]], 10)).toEqual([10]); // capped
  });
});

describe("layoutTable", () => {
  it("renders bordered, aligned rows with a header rule", () => {
    const lines = layoutTable(["Name", "Qty"], [["apple", "3"], ["fig", "12"]], ["left", "right"]);
    expect(lines[0]).toMatch(/^┌─+┬─+┐$/);
    expect(lines).toContainEqual(expect.stringMatching(/^├─+┼─+┤$/));
    expect(lines.at(-1)).toMatch(/^└─+┴─+┘$/);
    // Header + a right-aligned qty cell.
    const body = lines.join("\n");
    expect(body).toContain("│ Name  │ Qty │");
    expect(body).toContain("│ apple │   3 │"); // right-aligned within width 3
    expect(body).toContain("│ fig   │  12 │");
  });

  it("wraps a wide cell across physical lines (no data lost)", () => {
    const lines = layoutTable(["Note"], [["alpha beta gamma delta"]], ["left"], 11);
    const body = lines.join("\n");
    expect(body).toContain("alpha beta");
    expect(body).toContain("gamma delta");
  });

  it("respects empty cells and ragged rows", () => {
    const lines = layoutTable(["A", "B"], [["x"], ["", "y"]], ["left", "left"]);
    expect(lines.join("\n")).toContain("│ x │   │"); // missing B cell → blank
  });
});
