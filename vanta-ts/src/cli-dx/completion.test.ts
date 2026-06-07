import { describe, it, expect } from "vitest";
import { completionScript, resolveShell, CLI_COMMANDS } from "./completion.js";

describe("resolveShell", () => {
  it("defaults to bash, accepts zsh/fish", () => {
    expect(resolveShell(undefined)).toBe("bash");
    expect(resolveShell("zsh")).toBe("zsh");
    expect(resolveShell("fish")).toBe("fish");
    expect(resolveShell("nonsense")).toBe("bash");
  });
});

describe("completionScript", () => {
  it("bash uses compgen + complete -F and lists the commands", () => {
    const s = completionScript("bash", ["run", "status"]);
    expect(s).toContain("complete -F _vanta_completion vanta");
    expect(s).toContain("run status");
  });

  it("zsh emits a #compdef header", () => {
    expect(completionScript("zsh")).toContain("#compdef vanta");
  });

  it("fish emits one complete line per command", () => {
    const s = completionScript("fish", ["run", "status"]);
    expect(s).toContain("complete -c vanta -n __fish_use_subcommand -a run");
    expect(s).toContain("complete -c vanta -n __fish_use_subcommand -a status");
  });

  it("includes the real commands by default (lint, open, backup)", () => {
    const s = completionScript("bash");
    for (const c of ["lint", "open", "backup", "import", "prompt-size"]) expect(CLI_COMMANDS).toContain(c);
    expect(s).toContain("lint");
  });
});
