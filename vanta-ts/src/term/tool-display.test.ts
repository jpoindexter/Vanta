import { describe, it, expect } from "vitest";
import { abbrevPath, bashLabel, toolDisplay } from "./tool-display.js";

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
    expect(abbrevPath("vanta-ts/src/tools/web-search.ts")).toBe("…/tools/web-search.ts");
  });

  it("leaves a short path alone", () => {
    expect(abbrevPath("README.md")).toBe("README.md");
    expect(abbrevPath("src/cli.ts")).toBe("src/cli.ts");
  });
});

describe("bashLabel", () => {
  it("extracts text after # from the first line", () => {
    expect(bashLabel("# Install deps\nnpm install")).toBe("Install deps");
  });

  it("returns null when no leading comment", () => {
    expect(bashLabel("npm install")).toBeNull();
    expect(bashLabel("")).toBeNull();
  });

  it("returns null for a bare # with no text", () => {
    expect(bashLabel("#\nnpm install")).toBeNull();
  });

  it("ignores leading whitespace on the first line", () => {
    expect(bashLabel("  # Build project\nmake")).toBe("Build project");
  });
});

describe("toolDisplay", () => {
  it("renders read_file with an abbreviated path, no JSON", () => {
    const d = toolDisplay("read_file", { path: "vanta-ts/src/tools/web-search.ts" });
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

  it("uses the first # comment as the label for shell_cmd", () => {
    const d = toolDisplay("shell_cmd", { command: "# Run tests\nnpm test" });
    expect(d.detail).toBe("Run tests");
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

  it("gives search/background tools clean verbs instead of the raw snake_case name", () => {
    const grep = toolDisplay("grep_files", { pattern: "tui|ui|ink", path: "src" });
    expect(grep.verb).toBe("grep"); // not "grep_files"
    expect(grep.detail).toBe("tui|ui|ink");
    expect(toolDisplay("glob_files", { pattern: "**/*.ts" }).verb).toBe("glob");
    expect(toolDisplay("bg_status", { id: "bg-1" }).verb).toBe("background");
    expect(toolDisplay("ref_search", { query: "x" }).verb).toBe("ref"); // prefix
  });

  it("renders team task assignments as team transcript rows", () => {
    const d = toolDisplay("team", { action: "dispatch", taskId: "t-1", workerId: "analyst", title: "Map the market" });
    expect(d.icon).toBe("◆");
    expect(d.verb).toBe("team");
    expect(d.detail).toBe("t-1 -> analyst: Map the market");
  });

  it("never emits raw JSON for an unknown tool", () => {
    const d = toolDisplay("mystery_tool", { path: "/var/folders/T/NSIRD_x/y.png", n: 3 });
    expect(d.detail).not.toContain("{");
    expect(d.detail).not.toContain("NSIRD");
    expect(d.verb).toBe("mystery_tool");
  });
});
