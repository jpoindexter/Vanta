import { describe, it, expect } from "vitest";
import { isSlashLine, slashHead, matchSlash, completeSlash, isPartialSlash, type SlashMatch } from "./slash.js";
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
  it("includes skill entries after builtins", () => {
    const skills: SlashMatch[] = [{ name: "hill-climb", desc: "Iterate toward a target." }];
    const m = matchSlash("/hi", skills);
    expect(m.some((c) => c.name === "hill-climb")).toBe(true);
  });
  it("builtins win on name collision with a skill", () => {
    const skills: SlashMatch[] = [{ name: "help", desc: "shadowed" }];
    const m = matchSlash("/help", skills);
    const helpEntry = m.find((c) => c.name === "help");
    expect(helpEntry?.desc).not.toBe("shadowed");
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
  const spyFx = (): SlashEffects & { notes: string[]; sends: string[]; themes: string[]; anchors: string[]; exits: number } => {
    const notes: string[] = [], sends: string[] = [], themes: string[] = [], anchors: string[] = [];
    let exits = 0;
    return { notes, sends, themes, anchors, get exits() { return exits; }, note: (t) => notes.push(t), send: (t) => sends.push(t), theme: (t) => themes.push(t), composerAnchor: (m) => anchors.push(m), exit: () => { exits += 1; } };
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

  it("routes a theme signal to the theme effect", () => {
    const fx = spyFx();
    applySlashResult({ theme: "muted", output: "  ✓ theme set to muted" }, fx);
    expect(fx.themes).toEqual(["muted"]);
    expect(fx.notes).toEqual(["  ✓ theme set to muted"]);
  });

  it("routes a composerAnchor signal to the composerAnchor effect", () => {
    const fx = spyFx();
    applySlashResult({ composerAnchor: "bottom", output: "  ✓ composer bottom" }, fx);
    expect(fx.anchors).toEqual(["bottom"]);
    expect(fx.notes).toEqual(["  ✓ composer bottom"]);
  });
});
