import { describe, it, expect } from "vitest";
import { isSlashLine, slashHead, matchSlash, completeSlash, isPartialSlash } from "./slash.js";
import { applySlashResult, type SlashEffects } from "./use-slash.js";

describe("isSlashLine", () => {
  it("accepts a command line", () => {
    expect(isSlashLine("/help")).toBe(true);
    expect(isSlashLine("/model gpt-4o")).toBe(true);
  });
  it("rejects plain text, paths, and urls", () => {
    expect(isSlashLine("hello")).toBe(false);
    expect(isSlashLine("/foo/bar")).toBe(false); // a path, not a command
    expect(isSlashLine("http://x")).toBe(false);
  });
});

describe("matchSlash", () => {
  it("matches by name prefix and caps the list", () => {
    const m = matchSlash("/mo");
    expect(m.every((c) => c.name.startsWith("mo"))).toBe(true);
    expect(m.some((c) => c.name === "model")).toBe(true);
    expect(matchSlash("/").length).toBeLessThanOrEqual(8);
  });
  it("returns nothing once an argument is being typed", () => {
    expect(matchSlash("/model ")).toEqual([]);
    expect(matchSlash("/model gpt-4o")).toEqual([]);
  });
});

describe("completeSlash + isPartialSlash + slashHead", () => {
  it("expands a partial to the selected full command", () => {
    const m = matchSlash("/mod");
    expect(completeSlash("/mod", m, 0)).toBe(`/${m[0]!.name}`);
  });
  it("flags an unfinished name but not an exact hit", () => {
    expect(isPartialSlash("/hel", matchSlash("/hel"))).toBe(true);
    expect(isPartialSlash("/help", matchSlash("/help"))).toBe(false); // exact
    expect(isPartialSlash("/model x", matchSlash("/model x"))).toBe(false); // has arg
  });
  it("slashHead reads the command word", () => {
    expect(slashHead("/model gpt-4o")).toBe("model");
  });
});

describe("applySlashResult", () => {
  const spyFx = (): SlashEffects & { notes: string[]; sends: string[]; exits: number } => {
    const notes: string[] = [], sends: string[] = [];
    let exits = 0;
    return { notes, sends, get exits() { return exits; }, note: (t) => notes.push(t), send: (t) => sends.push(t), exit: () => { exits += 1; } };
  };
  it("routes output to a note", () => {
    const fx = spyFx();
    applySlashResult({ output: "  hi" }, fx);
    expect(fx.notes).toEqual(["  hi"]);
  });
  it("routes resend to send", () => {
    const fx = spyFx();
    applySlashResult({ resend: "do it" }, fx);
    expect(fx.sends).toEqual(["do it"]);
  });
  it("exits on exit", () => {
    const fx = spyFx();
    applySlashResult({ exit: true }, fx);
    expect(fx.exits).toBe(1);
  });
});
