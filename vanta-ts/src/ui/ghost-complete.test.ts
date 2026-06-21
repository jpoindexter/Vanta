import { describe, it, expect } from "vitest";
import { suggestGhost, acceptGhost, formatGhost } from "./ghost-complete.js";

// Control bytes are built via String.fromCharCode so this source file carries NO
// literal control bytes (same discipline as ui/history-picker.ts).
const ESC = String.fromCharCode(0x1b); // ESC — start of an ANSI escape
const BEL = String.fromCharCode(0x07); // BEL — a bare C0 control byte

describe("suggestGhost — the suggest-pick", () => {
  it("returns the suffix of the most-recent matching entry (newest = last)", () => {
    // Both start with "git commit"; the later (more recent) one wins.
    expect(suggestGhost("git commit", ["git commit -m", "git commit -am"])).toBe(" -am");
  });

  it("most-recent match wins even when an older entry also matches", () => {
    const history = ["deploy staging", "deploy prod", "deploy canary"];
    expect(suggestGhost("deploy ", history)).toBe("canary");
  });

  it("skips a more-recent non-matching entry and finds the recent matching one", () => {
    const history = ["npm run build", "git status", "npm run test"];
    expect(suggestGhost("npm run ", history)).toBe("test");
  });

  it("empty input → no ghost", () => {
    expect(suggestGhost("", ["npm install"])).toBe("");
  });

  it("whitespace-only input → no ghost", () => {
    expect(suggestGhost("   ", ["   later"])).toBe("");
  });

  it("no match → no ghost", () => {
    expect(suggestGhost("git", ["npm install", "npm test"])).toBe("");
  });

  it("exact-equal entry → no ghost (nothing to add)", () => {
    expect(suggestGhost("git status", ["git status"])).toBe("");
  });

  it("empty history → no ghost", () => {
    expect(suggestGhost("git", [])).toBe("");
  });

  it("multi-line input → no ghost (single-line completion only)", () => {
    expect(suggestGhost("git\nstatus", ["git\nstatus extra"])).toBe("");
  });

  it("is case-sensitive on the prefix", () => {
    expect(suggestGhost("Git", ["git status"])).toBe("");
    expect(suggestGhost("git", ["git status"])).toBe(" status");
  });

  it("strips control bytes from the candidate so the ghost cannot inject an escape", () => {
    // Candidate carries an ESC + CSI color sequence mid-string; once the control
    // bytes are stripped the entry is "run [31msafe" (no ESC), and the prefix
    // "run " yields the escape-free remainder.
    const malicious = `run ${ESC}[31msafe`;
    const ghost = suggestGhost("run ", [malicious]);
    expect(ghost).toBe("[31msafe");
    expect(ghost).not.toContain(ESC);
  });

  it("strips a leading control byte that would otherwise break the prefix match", () => {
    // Raw entry starts with a BEL control byte; once stripped it becomes "git push",
    // which matches the typed prefix "git ".
    const ghost = suggestGhost("git ", [`${BEL}git push`]);
    expect(ghost).toBe("push");
  });

  it("preserves literal spaces in the suffix (autosuggest must not collapse spacing)", () => {
    expect(suggestGhost("echo", ["echo   hello   world"])).toBe("   hello   world");
  });
});

describe("acceptGhost — committing the suggestion", () => {
  it("concatenates input + ghost into the full accepted text", () => {
    expect(acceptGhost("git commit", " -am")).toBe("git commit -am");
  });

  it("an empty ghost leaves the input unchanged", () => {
    expect(acceptGhost("git status", "")).toBe("git status");
  });

  it("a suggested ghost round-trips: input + suggestGhost(input) === the entry", () => {
    const entry = "npm run lint --fix";
    const input = "npm run ";
    expect(acceptGhost(input, suggestGhost(input, [entry]))).toBe(entry);
  });
});

describe("formatGhost — the display split", () => {
  it("separates the typed input from the dim ghost portion", () => {
    expect(formatGhost("git commit", " -am")).toEqual({ input: "git commit", ghost: " -am" });
  });

  it("no ghost → only the input portion is non-empty", () => {
    expect(formatGhost("git status", "")).toEqual({ input: "git status", ghost: "" });
  });

  it("the input portion is what a normal Text renders; the ghost is the dim suffix", () => {
    const display = formatGhost("deploy ", "canary");
    expect(display.input + display.ghost).toBe("deploy canary");
  });
});
