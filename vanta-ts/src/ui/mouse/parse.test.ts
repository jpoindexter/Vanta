import { describe, expect, it } from "vitest";
import { parseMouseEvent } from "./parse.js";

describe("parseMouseEvent", () => {
  it("parses a left-button press and normalises to 0-based coordinates", () => {
    expect(parseMouseEvent("\x1b[<0;12;5M")).toEqual({
      button: "left",
      action: "press",
      x: 11,
      y: 4,
    });
  });

  it("parses a left-button release (final 'm')", () => {
    expect(parseMouseEvent("\x1b[<0;12;5m")).toEqual({
      button: "left",
      action: "release",
      x: 11,
      y: 4,
    });
  });

  it("parses pointer motion (the 32 motion bit) with no held button", () => {
    expect(parseMouseEvent("\x1b[<35;3;7M")).toEqual({
      button: "none",
      action: "move",
      x: 2,
      y: 6,
    });
  });

  it("parses a held-button drag as a move on the dragged button", () => {
    // 32 (motion) + 0 (left) = 32 -> left button still down while moving.
    expect(parseMouseEvent("\x1b[<32;3;7M")).toEqual({
      button: "left",
      action: "move",
      x: 2,
      y: 6,
    });
  });

  it("parses middle and right buttons", () => {
    expect(parseMouseEvent("\x1b[<1;1;1M")?.button).toBe("middle");
    expect(parseMouseEvent("\x1b[<2;1;1M")?.button).toBe("right");
  });

  it("parses scroll up and down as discrete presses", () => {
    expect(parseMouseEvent("\x1b[<64;10;10M")).toEqual({
      button: "scroll-up",
      action: "press",
      x: 9,
      y: 9,
    });
    expect(parseMouseEvent("\x1b[<65;10;10M")).toEqual({
      button: "scroll-down",
      action: "press",
      x: 9,
      y: 9,
    });
  });

  it("returns null for a non-mouse escape sequence", () => {
    expect(parseMouseEvent("\x1b[A")).toBeNull(); // cursor up
    expect(parseMouseEvent("\x1b[200~")).toBeNull(); // bracketed paste start
  });

  it("returns null for plain text and empty input", () => {
    expect(parseMouseEvent("hello")).toBeNull();
    expect(parseMouseEvent("")).toBeNull();
  });

  it("returns null for a malformed SGR mouse sequence", () => {
    expect(parseMouseEvent("\x1b[<0;12M")).toBeNull(); // missing a coordinate
    expect(parseMouseEvent("\x1b[<0;12;5")).toBeNull(); // missing the final M/m
    expect(parseMouseEvent("\x1b[<0;12;5X")).toBeNull(); // wrong terminator
    expect(parseMouseEvent("\x1b[<a;12;5M")).toBeNull(); // non-numeric button
  });

  it("returns null for out-of-range (non-positive) coordinates", () => {
    expect(parseMouseEvent("\x1b[<0;0;5M")).toBeNull();
    expect(parseMouseEvent("\x1b[<0;5;0M")).toBeNull();
  });

  it("rejects a sequence with leading or trailing noise (anchored match)", () => {
    expect(parseMouseEvent("x\x1b[<0;1;1M")).toBeNull();
    expect(parseMouseEvent("\x1b[<0;1;1Mx")).toBeNull();
  });
});
