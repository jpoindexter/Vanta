import { describe, it, expect } from "vitest";
import { abbrevPath, toolDisplay, partitionBlocks } from "./tool-display.js";
import type { Entry } from "./transcript.js";

describe("abbrevPath", () => {
  it("reduces a temp screenshot path to its basename — no NSIRD leak", () => {
    const p = "/var/folders/q4/abc/T/NSIRD_screencaptureui_xY/screenshot.png";
    const out = abbrevPath(p);
    expect(out).toBe("screenshot.png");
    expect(out).not.toContain("NSIRD");
    expect(out).not.toContain("/var/folders");
  });

  it("collapses $HOME to ~", () => {
    const home = process.env.HOME ?? "/Users/x";
    expect(abbrevPath(`${home}/Desktop/notes.md`)).toBe("~/Desktop/notes.md");
  });

  it("keeps the last two segments of a deep relative path with a … prefix", () => {
    expect(abbrevPath("argo-ts/src/tools/web-search.ts")).toBe("…/tools/web-search.ts");
  });

  it("leaves a short path alone", () => {
    expect(abbrevPath("README.md")).toBe("README.md");
    expect(abbrevPath("src/cli.ts")).toBe("src/cli.ts");
  });
});

describe("toolDisplay", () => {
  it("renders read_file with an abbreviated path, no JSON", () => {
    const d = toolDisplay("read_file", { path: "argo-ts/src/tools/web-search.ts" });
    expect(d.verb).toBe("read");
    expect(d.detail).toBe("…/tools/web-search.ts");
    expect(d.icon).toBeTruthy();
  });

  it("renders look_at_screen WITHOUT any temp path detail", () => {
    const d = toolDisplay("look_at_screen", {});
    expect(d.verb).toMatch(/screen/i);
    expect(d.detail).toBe("");
  });

  it("shows the command as the detail for shell_cmd", () => {
    const d = toolDisplay("shell_cmd", { command: "git status --porcelain" });
    expect(d.detail).toBe("git status --porcelain");
  });

  it("truncates an over-long command", () => {
    const long = "echo " + "x".repeat(100);
    expect(toolDisplay("shell_cmd", { command: long }).detail.length).toBeLessThanOrEqual(60);
  });

  it("collapses a git family tool to its subcommand", () => {
    const d = toolDisplay("git_commit", { message: "feat: x" });
    expect(d.verb).toBe("git");
    expect(d.detail).toBe("commit");
  });

  it("uses query for web_search and host for web_fetch", () => {
    expect(toolDisplay("web_search", { query: "ink react" }).detail).toBe("ink react");
    expect(toolDisplay("web_fetch", { url: "https://example.com/a/b" }).detail).toBe("example.com");
  });

  it("never emits raw JSON for an unknown tool", () => {
    const d = toolDisplay("mystery_tool", { path: "/var/folders/T/NSIRD_x/y.png", n: 3 });
    expect(d.detail).not.toContain("{");
    expect(d.detail).not.toContain("NSIRD");
    expect(d.verb).toBe("mystery_tool");
  });
});

describe("partitionBlocks", () => {
  const tool = (name: string): Entry => ({ kind: "tool", name, icon: "•", verb: name, detail: "" });

  it("groups consecutive tool entries into one tools block", () => {
    const entries: Entry[] = [
      { kind: "user", text: "hi" },
      tool("read_file"),
      tool("shell_cmd"),
      tool("write_file"),
      { kind: "assistant", text: "done" },
    ];
    const blocks = partitionBlocks(entries);
    expect(blocks.map((b) => b.type)).toEqual(["single", "tools", "single"]);
    const toolsBlock = blocks[1];
    expect(toolsBlock?.type === "tools" && toolsBlock.items.length).toBe(3);
  });

  it("keeps separate tool runs in separate blocks", () => {
    const entries: Entry[] = [tool("a"), { kind: "assistant", text: "x" }, tool("b")];
    const blocks = partitionBlocks(entries);
    expect(blocks.map((b) => b.type)).toEqual(["tools", "single", "tools"]);
  });

  it("returns no blocks for an empty transcript", () => {
    expect(partitionBlocks([])).toEqual([]);
  });
});
