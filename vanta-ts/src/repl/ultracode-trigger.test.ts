import { describe, it, expect } from "vitest";
import {
  hasUltracodeTrigger,
  stripUltracodeTrigger,
  buildUltracodeDirective,
} from "./ultracode-trigger.js";

describe("hasUltracodeTrigger", () => {
  it("detects the bare keyword as a whole word", () => {
    expect(hasUltracodeTrigger("ultracode refactor the parser")).toBe(true);
  });

  it("detects the keyword mid-sentence", () => {
    expect(hasUltracodeTrigger("please ultracode this migration")).toBe(true);
  });

  it("detects the keyword at the end of the prompt", () => {
    expect(hasUltracodeTrigger("rewrite the auth flow, ultracode")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(hasUltracodeTrigger("ULTRACODE the build")).toBe(true);
    expect(hasUltracodeTrigger("UltraCode the build")).toBe(true);
    expect(hasUltracodeTrigger("UltRaCoDe the build")).toBe(true);
  });

  it("does NOT match inside a larger word", () => {
    expect(hasUltracodeTrigger("this is ultracoded already")).toBe(false);
    expect(hasUltracodeTrigger("ask the ultracoder")).toBe(false);
    expect(hasUltracodeTrigger("myultracode helper")).toBe(false);
    expect(hasUltracodeTrigger("ultracodebase scan")).toBe(false);
  });

  it("returns false when the keyword is absent", () => {
    expect(hasUltracodeTrigger("just fix the failing test")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(hasUltracodeTrigger("")).toBe(false);
  });

  it("matches across word boundaries other than spaces (punctuation)", () => {
    expect(hasUltracodeTrigger("(ultracode)")).toBe(true);
    expect(hasUltracodeTrigger("ultracode: go")).toBe(true);
    expect(hasUltracodeTrigger("ultracode!")).toBe(true);
  });
});

describe("stripUltracodeTrigger", () => {
  it("removes a leading keyword and tidies whitespace", () => {
    expect(stripUltracodeTrigger("ultracode refactor the parser")).toBe(
      "refactor the parser",
    );
  });

  it("removes a trailing keyword and the orphaned comma space", () => {
    expect(stripUltracodeTrigger("rewrite the auth flow, ultracode")).toBe(
      "rewrite the auth flow,",
    );
  });

  it("removes a mid-sentence keyword and collapses the double space", () => {
    expect(stripUltracodeTrigger("please ultracode this migration")).toBe(
      "please this migration",
    );
  });

  it("removes the keyword case-insensitively", () => {
    expect(stripUltracodeTrigger("ULTRACODE build the index")).toBe(
      "build the index",
    );
  });

  it("removes every occurrence", () => {
    expect(stripUltracodeTrigger("ultracode ultracode go")).toBe("go");
  });

  it("leaves substring-only matches intact", () => {
    expect(stripUltracodeTrigger("this is ultracoded already")).toBe(
      "this is ultracoded already",
    );
  });

  it("returns the text unchanged when the keyword is absent", () => {
    const text = "just fix the failing test";
    expect(stripUltracodeTrigger(text)).toBe(text);
  });

  it("returns an empty-ish result when the prompt is only the keyword", () => {
    expect(stripUltracodeTrigger("ultracode")).toBe("");
  });
});

describe("buildUltracodeDirective", () => {
  it("returns the multi-agent coding-push disposition note", () => {
    const directive = buildUltracodeDirective();
    expect(directive).toContain("multi-agent coding push");
    expect(directive).toContain("delegate/swarm parallel subagents on DISJOINT files");
    expect(directive).toContain("adversarially verify");
    expect(directive).toContain("Keep every slice green.");
  });

  it("is deterministic (pure)", () => {
    expect(buildUltracodeDirective()).toBe(buildUltracodeDirective());
  });

  it("mirrors what the /ultracode command injects (no Task: trailer — the host prepends it)", () => {
    // The slash command's preamble ends with "\n\nTask: "; the trigger directive
    // is the disposition body only, so the host can prepend it cleanly.
    expect(buildUltracodeDirective().endsWith("Task: ")).toBe(false);
  });
});
