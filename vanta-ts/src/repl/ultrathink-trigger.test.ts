import { describe, it, expect } from "vitest";
import {
  hasUltrathinkTrigger,
  stripUltrathinkTrigger,
  ultrathinkEffortLevel,
} from "./ultrathink-trigger.js";

describe("hasUltrathinkTrigger", () => {
  it("detects the bare keyword as a whole word", () => {
    expect(hasUltrathinkTrigger("ultrathink this architecture")).toBe(true);
  });

  it("detects the keyword mid-sentence", () => {
    expect(hasUltrathinkTrigger("please ultrathink the migration plan")).toBe(true);
  });

  it("detects the keyword at the end of the prompt", () => {
    expect(hasUltrathinkTrigger("design the auth flow, ultrathink")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(hasUltrathinkTrigger("ULTRATHINK the design")).toBe(true);
    expect(hasUltrathinkTrigger("UltraThink the design")).toBe(true);
    expect(hasUltrathinkTrigger("UltRaThInK the design")).toBe(true);
  });

  it("does NOT match inside a larger word", () => {
    expect(hasUltrathinkTrigger("we already ultrathinking this")).toBe(false);
    expect(hasUltrathinkTrigger("ask the ultrathinker")).toBe(false);
    expect(hasUltrathinkTrigger("myultrathink helper")).toBe(false);
    expect(hasUltrathinkTrigger("ultrathinkmode scan")).toBe(false);
  });

  it("returns false when the keyword is absent", () => {
    expect(hasUltrathinkTrigger("just fix the failing test")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(hasUltrathinkTrigger("")).toBe(false);
  });

  it("matches across word boundaries other than spaces (punctuation)", () => {
    expect(hasUltrathinkTrigger("(ultrathink)")).toBe(true);
    expect(hasUltrathinkTrigger("ultrathink: go")).toBe(true);
    expect(hasUltrathinkTrigger("ultrathink!")).toBe(true);
  });
});

describe("stripUltrathinkTrigger", () => {
  it("removes a leading keyword and tidies whitespace", () => {
    expect(stripUltrathinkTrigger("ultrathink design the parser")).toBe(
      "design the parser",
    );
  });

  it("removes a trailing keyword and the orphaned comma space", () => {
    expect(stripUltrathinkTrigger("design the auth flow, ultrathink")).toBe(
      "design the auth flow,",
    );
  });

  it("removes a mid-sentence keyword and collapses the double space", () => {
    expect(stripUltrathinkTrigger("please ultrathink this migration")).toBe(
      "please this migration",
    );
  });

  it("removes the keyword case-insensitively", () => {
    expect(stripUltrathinkTrigger("ULTRATHINK plan the index")).toBe(
      "plan the index",
    );
  });

  it("removes every occurrence", () => {
    expect(stripUltrathinkTrigger("ultrathink ultrathink go")).toBe("go");
  });

  it("leaves substring-only matches intact", () => {
    expect(stripUltrathinkTrigger("we already ultrathinking this")).toBe(
      "we already ultrathinking this",
    );
  });

  it("returns the text unchanged when the keyword is absent", () => {
    const text = "just fix the failing test";
    expect(stripUltrathinkTrigger(text)).toBe(text);
  });

  it("returns an empty result when the prompt is only the keyword", () => {
    expect(stripUltrathinkTrigger("ultrathink")).toBe("");
  });
});

describe("ultrathinkEffortLevel", () => {
  it("returns the MAX effort level — matching what /ultrathink engages", () => {
    expect(ultrathinkEffortLevel()).toBe("max");
  });

  it("is deterministic (pure)", () => {
    expect(ultrathinkEffortLevel()).toBe(ultrathinkEffortLevel());
  });
});
