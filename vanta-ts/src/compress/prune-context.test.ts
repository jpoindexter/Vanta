import { describe, it, expect } from "vitest";
import {
  pruneContextEnabled,
  pruneContextText,
  DEFAULT_CONTEXT_KEEP_RATIO,
  type PruneFn,
} from "./prune-context.js";
import { estTokens } from "./types.js";

const ON: NodeJS.ProcessEnv = { VANTA_PRUNE_CONTEXT: "1" };
const OFF: NodeJS.ProcessEnv = {};

// A realistic chunk: predictable filler the pruner can drop + a few dense tokens.
const SAMPLE = [
  "The system is going to process the request and then it will return a value.",
  "Please note that the value of the threshold is 0.6 and the identifier is X9F2A.",
  "It is important to be aware that the function will be called once per iteration.",
].join(" ");

describe("pruneContextEnabled", () => {
  it("is OFF by default (unset env)", () => {
    expect(pruneContextEnabled(OFF)).toBe(false);
  });

  it("is ON for '1' and 'true' (case/space tolerant), OFF otherwise", () => {
    expect(pruneContextEnabled({ VANTA_PRUNE_CONTEXT: "1" })).toBe(true);
    expect(pruneContextEnabled({ VANTA_PRUNE_CONTEXT: "true" })).toBe(true);
    expect(pruneContextEnabled({ VANTA_PRUNE_CONTEXT: " TRUE " })).toBe(true);
    expect(pruneContextEnabled({ VANTA_PRUNE_CONTEXT: "0" })).toBe(false);
    expect(pruneContextEnabled({ VANTA_PRUNE_CONTEXT: "false" })).toBe(false);
    expect(pruneContextEnabled({ VANTA_PRUNE_CONTEXT: "yes" })).toBe(false);
  });
});

describe("pruneContextText — default OFF is byte-identical (the safety property)", () => {
  it("returns the EXACT input text when the flag is OFF (no scorer ever invoked)", () => {
    let called = false;
    const spyPrune: PruneFn = (t) => {
      called = true;
      return { text: t.slice(0, 1), keptRatio: 0.01 };
    };
    const out = pruneContextText(SAMPLE, OFF, { prune: spyPrune });
    // Byte-identical: same reference-equal string content, char-for-char.
    expect(out).toBe(SAMPLE);
    expect(called).toBe(false); // the prune fn is never reached when OFF
  });

  it("default OFF leaves a wide variety of inputs unchanged", () => {
    for (const s of [SAMPLE, "", "   ", "single", "a\nb\nc", "{\"k\":1}"]) {
      expect(pruneContextText(s, OFF)).toBe(s);
    }
  });
});

describe("pruneContextText — ON prunes (fewer tokens)", () => {
  it("routes through the injected prune fn and returns the shorter text", () => {
    const half: PruneFn = (t) => {
      const cut = t.slice(0, Math.floor(t.length / 2));
      return { text: cut, keptRatio: 0.5 };
    };
    const out = pruneContextText(SAMPLE, ON, { prune: half });
    expect(out.length).toBeLessThan(SAMPLE.length);
    expect(estTokens(out)).toBeLessThan(estTokens(SAMPLE));
  });

  it("ON with the real default (winnow heuristic floor) shrinks tokens, zero config", () => {
    // No deps injected → defaultPrune = winnow pruneText, heuristic floor.
    const out = pruneContextText(SAMPLE, ON);
    expect(out.length).toBeLessThanOrEqual(SAMPLE.length);
    expect(estTokens(out)).toBeLessThanOrEqual(estTokens(SAMPLE));
    // The heuristic prune at keepRatio 0.6 should measurably reduce a verbose chunk.
    expect(estTokens(out)).toBeLessThan(estTokens(SAMPLE));
  });

  it("passes the default keepRatio (0.6) through to the prune fn", () => {
    let seen = -1;
    const capture: PruneFn = (t, opts) => {
      seen = opts.keepRatio;
      return { text: t.slice(0, 5), keptRatio: opts.keepRatio };
    };
    pruneContextText(SAMPLE, ON, { prune: capture });
    expect(seen).toBe(DEFAULT_CONTEXT_KEEP_RATIO);
  });

  it("honors an injected keepRatio (clamped to [0,1])", () => {
    let seen = -1;
    const capture: PruneFn = (t, opts) => {
      seen = opts.keepRatio;
      return { text: t.slice(0, 5), keptRatio: opts.keepRatio };
    };
    pruneContextText(SAMPLE, ON, { prune: capture, keepRatio: 0.3 });
    expect(seen).toBe(0.3);
    pruneContextText(SAMPLE, ON, { prune: capture, keepRatio: 5 });
    expect(seen).toBe(1); // clamped
    pruneContextText(SAMPLE, ON, { prune: capture, keepRatio: Number.NaN });
    expect(seen).toBe(DEFAULT_CONTEXT_KEEP_RATIO); // non-finite → default
  });
});

describe("pruneContextText — errors-as-values + edge cases", () => {
  it("a prune that throws → returns the ORIGINAL text (never throws)", () => {
    const boom: PruneFn = () => {
      throw new Error("scorer exploded");
    };
    expect(() => pruneContextText(SAMPLE, ON, { prune: boom })).not.toThrow();
    expect(pruneContextText(SAMPLE, ON, { prune: boom })).toBe(SAMPLE);
  });

  it("empty / whitespace input → returned unchanged even when ON (nothing to prune)", () => {
    expect(pruneContextText("", ON)).toBe("");
    expect(pruneContextText("   \n  ", ON)).toBe("   \n  ");
  });

  it("a prune that inflates the text → rejected in favor of the original", () => {
    const inflate: PruneFn = (t) => ({ text: t + t, keptRatio: 1 });
    expect(pruneContextText(SAMPLE, ON, { prune: inflate })).toBe(SAMPLE);
  });

  it("a prune that returns empty for non-empty input → rejected (original kept)", () => {
    const empties: PruneFn = () => ({ text: "", keptRatio: 0 });
    expect(pruneContextText(SAMPLE, ON, { prune: empties })).toBe(SAMPLE);
  });

  it("a prune that returns the same-length text → kept as original (no shrink)", () => {
    const noop: PruneFn = (t) => ({ text: t, keptRatio: 1 });
    expect(pruneContextText(SAMPLE, ON, { prune: noop })).toBe(SAMPLE);
  });
});
