import { describe, it, expect } from "vitest";
import {
  stablePrefixHash,
  detectCacheBreak,
  initCacheBreakState,
  noteStablePrefix,
} from "./cache-break.js";

const PREFIX_A = "# Vanta\nstable rules\n\nAvailable tools:\n- read_file: read a file";
const PREFIX_B = "# Vanta\nstable rules\n\nAvailable tools:\n- read_file: read a file\n- write_file: write";

describe("stablePrefixHash", () => {
  it("is deterministic for the same prefix", () => {
    expect(stablePrefixHash(PREFIX_A)).toBe(stablePrefixHash(PREFIX_A));
  });

  it("changes when the prefix changes", () => {
    expect(stablePrefixHash(PREFIX_A)).not.toBe(stablePrefixHash(PREFIX_B));
  });

  it("returns a fixed-length hex string", () => {
    const h = stablePrefixHash(PREFIX_A);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it("hashes the empty prefix without throwing", () => {
    expect(stablePrefixHash("")).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("detectCacheBreak", () => {
  it("same hash → no break", () => {
    const h = stablePrefixHash(PREFIX_A);
    expect(detectCacheBreak(h, h)).toBe(false);
  });

  it("different hash → break (cache invalidated)", () => {
    expect(detectCacheBreak(stablePrefixHash(PREFIX_A), stablePrefixHash(PREFIX_B))).toBe(true);
  });

  it("first-seen (no prior hash) → no break", () => {
    expect(detectCacheBreak(undefined, stablePrefixHash(PREFIX_A))).toBe(false);
  });
});

describe("noteStablePrefix (state threading)", () => {
  it("first observation never breaks and stores the hash", () => {
    const r = noteStablePrefix(initCacheBreakState(), PREFIX_A);
    expect(r.broke).toBe(false);
    expect(r.state.lastHash).toBe(stablePrefixHash(PREFIX_A));
  });

  it("an unchanged prefix on the next turn does not break", () => {
    const first = noteStablePrefix(initCacheBreakState(), PREFIX_A);
    const second = noteStablePrefix(first.state, PREFIX_A);
    expect(second.broke).toBe(false);
    expect(second.state.lastHash).toBe(first.state.lastHash);
  });

  it("a changed prefix on the next turn breaks and threads the new hash forward", () => {
    const first = noteStablePrefix(initCacheBreakState(), PREFIX_A);
    const second = noteStablePrefix(first.state, PREFIX_B);
    expect(second.broke).toBe(true);
    expect(second.state.lastHash).toBe(stablePrefixHash(PREFIX_B));
  });

  it("after a break, a stable prefix on the following turn does not re-break", () => {
    const t1 = noteStablePrefix(initCacheBreakState(), PREFIX_A);
    const t2 = noteStablePrefix(t1.state, PREFIX_B); // break
    const t3 = noteStablePrefix(t2.state, PREFIX_B); // same as t2 → no break
    expect(t2.broke).toBe(true);
    expect(t3.broke).toBe(false);
  });

  it("does not mutate the input state", () => {
    const state = initCacheBreakState();
    noteStablePrefix(state, PREFIX_A);
    expect(state.lastHash).toBeUndefined(); // returns a new state, never mutates
  });

  it("detects a break back to a previously-seen prefix (compares to immediate prior only)", () => {
    const t1 = noteStablePrefix(initCacheBreakState(), PREFIX_A);
    const t2 = noteStablePrefix(t1.state, PREFIX_B); // A→B break
    const t3 = noteStablePrefix(t2.state, PREFIX_A); // B→A break again
    expect(t2.broke).toBe(true);
    expect(t3.broke).toBe(true);
  });
});
