import { describe, it, expect } from "vitest";
import { ghostSuggestion, acceptGhost, ghostVisible } from "./history-ghost.js";

// Control/escape fixtures built from char codes so the test source stays printable.
const ESC = "\x1b";
const RED = `${ESC}[31m`; // CSI SGR colour
const RESET = `${ESC}[0m`;
const OSC_TITLE = `${ESC}]0;injected${ESC}\\`; // OSC set-title, ST-terminated
const BEL = "\x07";
const NUL = "\x00";

describe("ghostSuggestion", () => {
  it("returns the remainder after the typed prefix", () => {
    expect(ghostSuggestion("git", ["git status"])).toBe(" status");
  });

  it("returns '' when input is empty", () => {
    expect(ghostSuggestion("", ["git status", "ls -la"])).toBe("");
  });

  it("returns '' when no entry starts with the input", () => {
    expect(ghostSuggestion("npm", ["git status", "ls -la"])).toBe("");
  });

  it("returns '' when the input equals the full entry (nothing to add)", () => {
    expect(ghostSuggestion("git status", ["git status"])).toBe("");
  });

  it("returns '' for an empty history", () => {
    expect(ghostSuggestion("git", [])).toBe("");
  });

  it("picks the MOST-RECENT (highest-index) match when several match", () => {
    // newest-LAST: 'git push' is more recent than 'git status'.
    expect(ghostSuggestion("git ", ["git status", "git push"])).toBe("push");
  });

  it("is case-sensitive in the prefix match", () => {
    expect(ghostSuggestion("Git", ["git status"])).toBe("");
  });

  it("returns '' for a multi-line input", () => {
    expect(ghostSuggestion("git\nstatus", ["git\nstatus extra"])).toBe("");
  });

  it("ignores undefined holes in the history array", () => {
    const sparse = ["git status"];
    sparse[3] = "git push"; // leaves holes at indices 1,2 (undefined)
    expect(ghostSuggestion("git ", sparse)).toBe("push");
  });

  // SECURITY (the fix): a history entry carrying ANSI/control bytes must yield a ghost
  // with those bytes REMOVED — the ghost is rendered live into the terminal.
  it("control-strips ANSI colour codes out of the ghost", () => {
    const entry = `git ${RED}status${RESET}`;
    expect(ghostSuggestion("git ", [entry])).toBe("status");
  });

  it("control-strips an embedded ESC/OSC title-injection sequence", () => {
    const entry = `deploy ${OSC_TITLE}prod`;
    const ghost = ghostSuggestion("deploy ", [entry]);
    expect(ghost).toBe("prod");
    expect(ghost).not.toContain(ESC);
    expect(ghost).not.toContain("injected");
  });

  it("control-strips BEL and NUL bytes out of the ghost", () => {
    const entry = `run${BEL} test${NUL}s`;
    const ghost = ghostSuggestion("run", [entry]);
    expect(ghost).toBe(" tests");
    expect(ghost).not.toContain(BEL);
    expect(ghost).not.toContain(NUL);
  });

  it("the returned ghost never contains an ESC byte even when the source did", () => {
    const entry = `x${ESC}[1m${ESC}[31my${ESC}[0mz`;
    const ghost = ghostSuggestion("x", [entry]);
    expect(ghost).not.toContain(ESC);
    expect(ghost).toBe("yz");
  });
});

describe("acceptGhost", () => {
  it("completes the input with the ghost remainder", () => {
    expect(acceptGhost("git", ["git status"])).toBe("git status");
  });

  it("leaves the input unchanged when there is no ghost", () => {
    expect(acceptGhost("npm", ["git status"])).toBe("npm");
  });

  it("leaves the input unchanged when input is empty", () => {
    expect(acceptGhost("", ["git status"])).toBe("");
  });

  it("commits the control-stripped completion (no escape bytes leak in)", () => {
    const entry = `git ${RED}status${RESET}`;
    const completed = acceptGhost("git ", [entry]);
    expect(completed).toBe("git status");
    expect(completed).not.toContain(ESC);
  });
});

describe("ghostVisible", () => {
  it("is true when a non-empty ghost exists", () => {
    expect(ghostVisible("git", ["git status"])).toBe(true);
  });

  it("is false when no entry matches", () => {
    expect(ghostVisible("npm", ["git status"])).toBe(false);
  });

  it("is false for empty input", () => {
    expect(ghostVisible("", ["git status"])).toBe(false);
  });

  it("is false when input equals the full entry", () => {
    expect(ghostVisible("git status", ["git status"])).toBe(false);
  });
});
