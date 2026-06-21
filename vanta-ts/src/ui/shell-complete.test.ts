import { describe, it, expect } from "vitest";
import {
  classifyShellContext,
  completeCommand,
  completeVariable,
  completeFile,
  shellComplete,
  type ShellCompleteSources,
} from "./shell-complete.js";

/** Position the cursor at the end of `input` (the common "still typing" case). */
function atEnd(input: string): number {
  return input.length;
}

describe("classifyShellContext", () => {
  it("classifies the first word as a command", () => {
    expect(classifyShellContext("ec", atEnd("ec"))).toEqual({ kind: "command", fragment: "ec" });
  });

  it("classifies a $FOO token as a variable with the name after the $", () => {
    expect(classifyShellContext("echo $HO", atEnd("echo $HO"))).toEqual({
      kind: "variable",
      fragment: "HO",
    });
  });

  it("classifies a bare $ as a variable with an empty fragment", () => {
    expect(classifyShellContext("echo $", atEnd("echo $"))).toEqual({
      kind: "variable",
      fragment: "",
    });
  });

  it("classifies a later (non-first) word as a file", () => {
    expect(classifyShellContext("cat src/comp", atEnd("cat src/comp"))).toEqual({
      kind: "file",
      fragment: "src/comp",
    });
  });

  it("strips a leading ! and classifies as a real shell line", () => {
    expect(classifyShellContext("!ec", atEnd("!ec"))).toEqual({ kind: "command", fragment: "ec" });
  });

  it("strips a leading ! with a following space", () => {
    expect(classifyShellContext("! ls src/", atEnd("! ls src/"))).toEqual({
      kind: "file",
      fragment: "src/",
    });
  });

  it("classifies a $VAR after a stripped ! as a variable", () => {
    expect(classifyShellContext("!echo $PA", atEnd("!echo $PA"))).toEqual({
      kind: "variable",
      fragment: "PA",
    });
  });

  it("takes the fragment up to the cursor, not the whole token", () => {
    // cursor after "comp" inside "composer.tsx" → fragment is only "comp".
    const input = "cat composer.tsx";
    const cursor = "cat comp".length;
    expect(classifyShellContext(input, cursor)).toEqual({ kind: "file", fragment: "comp" });
  });

  it("classifies the empty input as a command with an empty fragment", () => {
    expect(classifyShellContext("", 0)).toEqual({ kind: "command", fragment: "" });
  });

  it("classifies the first word as a command even mid-token", () => {
    const cursor = "ec".length; // cursor inside "echo"
    expect(classifyShellContext("echo", cursor)).toEqual({ kind: "command", fragment: "ec" });
  });

  it("treats a token right after a space as a file (cursor at the space boundary)", () => {
    // "git " with the cursor at the end: an empty later-word fragment → file.
    expect(classifyShellContext("git ", atEnd("git "))).toEqual({ kind: "file", fragment: "" });
  });

  it("clamps an over-long cursor to the input end", () => {
    expect(classifyShellContext("ls", 999)).toEqual({ kind: "command", fragment: "ls" });
  });

  it("clamps a negative cursor to the start", () => {
    expect(classifyShellContext("ls", -5)).toEqual({ kind: "command", fragment: "" });
  });

  it("does not treat a lone ! line as a command fragment of '!'", () => {
    // "!" alone strips to an empty command line.
    expect(classifyShellContext("!", atEnd("!"))).toEqual({ kind: "command", fragment: "" });
  });
});

describe("completeCommand", () => {
  it("prefix-matches PATH executables, sorted", () => {
    expect(completeCommand("ec", ["echo", "ed", "ls", "ecpg"])).toEqual(["echo", "ecpg"].sort());
  });

  it("dedupes the same name appearing in two PATH dirs", () => {
    expect(completeCommand("l", ["ls", "ls", "ln"])).toEqual(["ln", "ls"]);
  });

  it("returns every command sorted for an empty fragment", () => {
    expect(completeCommand("", ["git", "awk", "cat"])).toEqual(["awk", "cat", "git"]);
  });

  it("caps the result list", () => {
    const cmds = ["aa", "ab", "ac", "ad"];
    expect(completeCommand("a", cmds, 2)).toEqual(["aa", "ab"]);
  });

  it("returns [] when nothing matches", () => {
    expect(completeCommand("zz", ["echo", "ls"])).toEqual([]);
  });
});

describe("completeVariable", () => {
  it("matches env names and prefixes each with $", () => {
    expect(completeVariable("HO", ["HOME", "HOSTNAME", "PATH"])).toEqual(["$HOME", "$HOSTNAME"]);
  });

  it("returns all env names ($-prefixed) for an empty fragment", () => {
    expect(completeVariable("", ["PATH", "HOME"])).toEqual(["$HOME", "$PATH"]);
  });

  it("dedupes a repeated env name", () => {
    expect(completeVariable("P", ["PATH", "PATH", "PWD"])).toEqual(["$PATH", "$PWD"]);
  });

  it("caps the result list", () => {
    expect(completeVariable("X", ["X1", "X2", "X3"], 2)).toEqual(["$X1", "$X2"]);
  });

  it("returns [] when nothing matches", () => {
    expect(completeVariable("ZZ", ["HOME", "PATH"])).toEqual([]);
  });
});

describe("completeFile", () => {
  it("prefix-matches cwd paths, sorted", () => {
    expect(completeFile("comp", ["composer.tsx", "compute.ts", "banner.tsx"])).toEqual([
      "composer.tsx",
      "compute.ts",
    ]);
  });

  it("keeps a directory's trailing slash (path-complete style)", () => {
    expect(completeFile("s", ["src/", "scripts/", "setup.ts"])).toEqual([
      "scripts/",
      "setup.ts",
      "src/",
    ]);
  });

  it("matches a nested partial path literally (no glob)", () => {
    expect(completeFile("src/comp", ["src/composer.tsx", "src/compose.ts", "src/banner.tsx"])).toEqual([
      "src/compose.ts",
      "src/composer.tsx",
    ]);
  });

  it("returns all files sorted for an empty fragment", () => {
    expect(completeFile("", ["b.ts", "a.ts"])).toEqual(["a.ts", "b.ts"]);
  });

  it("caps the result list", () => {
    expect(completeFile("a", ["a1", "a2", "a3"], 2)).toEqual(["a1", "a2"]);
  });

  it("returns [] when nothing matches", () => {
    expect(completeFile("zzz", ["a.ts", "b.ts"])).toEqual([]);
  });
});

describe("shellComplete", () => {
  const sources: ShellCompleteSources = {
    commands: ["echo", "ed", "ls", "git"],
    envNames: ["HOME", "HOSTNAME", "PATH"],
    files: ["src/", "setup.ts", "composer.tsx"],
  };

  it("routes a first word to the command completer", () => {
    expect(shellComplete("ec", atEnd("ec"), sources)).toEqual(["echo"]);
  });

  it("routes a $token to the variable completer", () => {
    expect(shellComplete("echo $HO", atEnd("echo $HO"), sources)).toEqual(["$HOME", "$HOSTNAME"]);
  });

  it("routes a later word to the file completer", () => {
    expect(shellComplete("cat s", atEnd("cat s"), sources)).toEqual(["setup.ts", "src/"]);
  });

  it("strips a leading ! before routing", () => {
    expect(shellComplete("!ec", atEnd("!ec"), sources)).toEqual(["echo"]);
  });

  it("returns [] when the classified completer finds no match", () => {
    expect(shellComplete("zzz", atEnd("zzz"), sources)).toEqual([]);
  });

  it("returns [] for an empty source even when the context classifies", () => {
    const empty: ShellCompleteSources = { commands: [], envNames: [], files: [] };
    expect(shellComplete("ec", atEnd("ec"), empty)).toEqual([]);
  });

  it("honors the cap across the routed completer", () => {
    expect(shellComplete("e", atEnd("e"), sources, 1)).toEqual(["echo"]);
  });

  it("completes a variable mid-token at the cursor", () => {
    // cursor after "$HO" inside "$HOME" → completes from "HO".
    const input = "echo $HOME";
    const cursor = "echo $HO".length;
    expect(shellComplete(input, cursor, sources)).toEqual(["$HOME", "$HOSTNAME"]);
  });
});
