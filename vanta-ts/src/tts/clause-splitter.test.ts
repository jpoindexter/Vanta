import { describe, expect, it } from "vitest";
import { ClauseSplitter } from "./clause-splitter.js";

describe("ClauseSplitter", () => {
  it("emits after the first complete clause across token boundaries", () => {
    const splitter = new ClauseSplitter({ minChars: 8 });
    expect(splitter.push("The answer is")).toEqual([]);
    expect(splitter.push(" ready. Next")).toEqual(["The answer is ready."]);
    expect(splitter.flush()).toEqual(["Next"]);
  });

  it("keeps abbreviations and decimals inside the current clause", () => {
    const splitter = new ClauseSplitter({ minChars: 4 });
    expect(splitter.push("Dr. Rivera measured 3.14 volts.")).toEqual([
      "Dr. Rivera measured 3.14 volts.",
    ]);
  });

  it("uses a bounded whitespace split for long run-on text", () => {
    const splitter = new ClauseSplitter({ minChars: 10, maxChars: 24 });
    const clauses = splitter.push("one two three four five six seven eight");
    expect(clauses[0]).toBe("one two three four five");
    expect(splitter.pending()).toBe("six seven eight");
  });

  it("resets uncommitted text at a tool boundary", () => {
    const splitter = new ClauseSplitter({ minChars: 8 });
    splitter.push("Draft without a boundary");
    splitter.reset();
    expect(splitter.flush()).toEqual([]);
  });
});
