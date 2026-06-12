import { describe, it, expect } from "vitest";
import { DEFAULT_BINDINGS, bindingFor, bindingsForContext, buildChordMap } from "./registry.js";
import { parseUserBindings } from "./user-bindings.js";
import { parseChord } from "./chord.js";

describe("DEFAULT_BINDINGS", () => {
  it("every action id is unique", () => {
    const ids = DEFAULT_BINDINGS.map((b) => b.action);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("every binding has at least one chord", () => {
    for (const b of DEFAULT_BINDINGS) expect(b.chords.length).toBeGreaterThan(0);
  });
  it("covers the core app actions", () => {
    expect(bindingFor("app.exit")).toBeDefined();
    expect(bindingFor("app.cycleApprovalMode")).toBeDefined();
    expect(bindingFor("transcript.toggleExpand")).toBeDefined();
    expect(bindingFor("palette.complete")).toBeDefined();
  });
});

describe("bindingsForContext", () => {
  it("groups bindings by context", () => {
    const composer = bindingsForContext("composer");
    expect(composer.length).toBeGreaterThan(5);
    expect(composer.every((b) => b.context === "composer")).toBe(true);
  });
});

describe("buildChordMap", () => {
  it("returns default chords with no overrides", () => {
    const map = buildChordMap(DEFAULT_BINDINGS, {});
    expect(map.get("app.exit")).toEqual([parseChord("ctrl+c")]);
  });
  it("user override replaces the default chord", () => {
    const overrides = parseUserBindings({ "transcript.toggleExpand": "ctrl+t" });
    const map = buildChordMap(DEFAULT_BINDINGS, overrides);
    expect(map.get("transcript.toggleExpand")).toEqual([parseChord("ctrl+t")]);
  });
  it("an override with only invalid chords is dropped (default kept)", () => {
    const overrides = parseUserBindings({ "app.exit": "garbage++" });
    const map = buildChordMap(DEFAULT_BINDINGS, overrides);
    expect(map.get("app.exit")).toEqual([parseChord("ctrl+c")]);
  });
});

describe("parseUserBindings", () => {
  it("accepts a single chord string", () => {
    expect(parseUserBindings({ "app.exit": "ctrl+q" })["app.exit"]).toEqual([parseChord("ctrl+q")]);
  });
  it("accepts an array of chords", () => {
    expect(parseUserBindings({ "palette.next": ["down", "ctrl+j"] })["palette.next"]).toHaveLength(2);
  });
  it("skips malformed chords but keeps valid ones", () => {
    const out = parseUserBindings({ "palette.next": ["down", "bogus+key+thing"] });
    expect(out["palette.next"]).toHaveLength(1);
  });
});
