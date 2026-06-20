import { describe, expect, it } from "vitest";
import {
  TEAMMATE_PALETTE,
  assignTeammateColors,
  teammateColor,
  teammateColorIndex,
} from "./teammate-color.js";

// Ink-accepted color names this palette draws from (base + bright ANSI). Used to
// assert every emitted color is a valid Ink color string.
const VALID_INK_COLORS = new Set([
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "gray",
  "grey",
  "blackBright",
  "redBright",
  "greenBright",
  "yellowBright",
  "blueBright",
  "magentaBright",
  "cyanBright",
  "whiteBright",
]);

describe("TEAMMATE_PALETTE", () => {
  it("is a non-empty list of valid, distinct Ink color strings", () => {
    expect(TEAMMATE_PALETTE.length).toBeGreaterThan(0);
    for (const color of TEAMMATE_PALETTE) {
      expect(VALID_INK_COLORS.has(color)).toBe(true);
    }
    expect(new Set(TEAMMATE_PALETTE).size).toBe(TEAMMATE_PALETTE.length);
  });

  it("excludes the mono-default foreground roles (white/gray/black)", () => {
    for (const reserved of ["white", "gray", "grey", "black"]) {
      expect((TEAMMATE_PALETTE as readonly string[]).includes(reserved)).toBe(false);
    }
  });
});

describe("teammateColorIndex / teammateColor", () => {
  it("maps the same id to the same index and color (stable)", () => {
    for (const id of ["worker-1", "fleet-abc", "agent.42", "Σ-ünïcode"]) {
      expect(teammateColorIndex(id)).toBe(teammateColorIndex(id));
      expect(teammateColor(id)).toBe(teammateColor(id));
    }
  });

  it("always returns an in-range index and a palette color", () => {
    for (const id of ["a", "worker-99", "", "x".repeat(200)]) {
      const index = teammateColorIndex(id);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(TEAMMATE_PALETTE.length);
      expect(Number.isInteger(index)).toBe(true);
      expect(TEAMMATE_PALETTE).toContain(teammateColor(id));
    }
  });

  it("handles empty and whitespace ids without throwing or NaN", () => {
    for (const id of ["", " ", "\n", "\t"]) {
      const index = teammateColorIndex(id);
      expect(Number.isNaN(index)).toBe(false);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(TEAMMATE_PALETTE.length);
      expect(VALID_INK_COLORS.has(teammateColor(id))).toBe(true);
    }
  });

  it("spreads sibling ids across the palette (well-distributed)", () => {
    // Sequential worker ids (the common fleet case) must not all collide.
    const ids = Array.from({ length: 12 }, (_, i) => `worker-${i}`);
    const indices = ids.map(teammateColorIndex);
    // Expect good coverage: at least half the palette is hit by 12 siblings.
    const distinct = new Set(indices);
    expect(distinct.size).toBeGreaterThanOrEqual(Math.ceil(TEAMMATE_PALETTE.length / 2));
  });
});

describe("assignTeammateColors", () => {
  it("gives every id a distinct color until the palette is exhausted", () => {
    const ids = Array.from({ length: TEAMMATE_PALETTE.length }, (_, i) => `w-${i}`);
    const map = assignTeammateColors(ids);
    const colors = [...map.values()];
    expect(colors.length).toBe(TEAMMATE_PALETTE.length);
    expect(new Set(colors).size).toBe(TEAMMATE_PALETTE.length); // all distinct
  });

  it("uses the full palette exactly once for a palette-sized fleet", () => {
    const ids = Array.from({ length: TEAMMATE_PALETTE.length }, (_, i) => `agent-${i}`);
    const colors = new Set(assignTeammateColors(ids).values());
    for (const color of TEAMMATE_PALETTE) {
      expect(colors.has(color)).toBe(true);
    }
  });

  it("cycles the palette when there are more agents than colors", () => {
    const n = TEAMMATE_PALETTE.length + 3;
    const ids = Array.from({ length: n }, (_, i) => `worker-${i}`);
    const map = assignTeammateColors(ids);
    expect(map.size).toBe(n); // every id assigned
    for (const color of map.values()) {
      expect(TEAMMATE_PALETTE).toContain(color); // only ever palette colors
    }
    // With cycling, distinct colors cap at the palette size, not the id count.
    expect(new Set(map.values()).size).toBe(TEAMMATE_PALETTE.length);
  });

  it("collapses duplicate ids to a single, stable entry", () => {
    const map = assignTeammateColors(["dup", "other", "dup", "dup"]);
    expect(map.size).toBe(2);
    expect(map.has("dup")).toBe(true);
    expect(map.has("other")).toBe(true);
    // Same id resolves to the same color on a repeat assignment run.
    expect(assignTeammateColors(["dup"]).get("dup")).toBe(map.get("dup"));
  });

  it("is deterministic — same input order yields the same map", () => {
    const ids = ["alpha", "beta", "gamma", "delta"];
    const a = assignTeammateColors(ids);
    const b = assignTeammateColors(ids);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it("handles an empty fleet and a single agent", () => {
    expect(assignTeammateColors([]).size).toBe(0);
    const one = assignTeammateColors(["solo"]);
    expect(one.size).toBe(1);
    expect(TEAMMATE_PALETTE).toContain(one.get("solo"));
  });

  it("emits only valid Ink color strings", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `t${i}`);
    for (const color of assignTeammateColors(ids).values()) {
      expect(VALID_INK_COLORS.has(color)).toBe(true);
    }
  });
});
