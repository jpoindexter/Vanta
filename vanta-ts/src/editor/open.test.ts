import { describe, it, expect } from "vitest";
import { parseFileLine, resolveEditor, editorCommand, editorOpenUrl } from "./open.js";

describe("parseFileLine", () => {
  it("parses file, file:line, and file:line:col", () => {
    expect(parseFileLine("src/a.ts")).toEqual({ file: "src/a.ts", line: 1 });
    expect(parseFileLine("src/a.ts:42")).toEqual({ file: "src/a.ts", line: 42 });
    expect(parseFileLine("src/a.ts:42:7")).toEqual({ file: "src/a.ts", line: 42 });
  });
});

describe("resolveEditor", () => {
  it("prefers VANTA_EDITOR > VISUAL > EDITOR, defaults to code", () => {
    expect(resolveEditor({ VANTA_EDITOR: "cursor", EDITOR: "vim" })).toBe("cursor");
    expect(resolveEditor({ VISUAL: "nvim" })).toBe("nvim");
    expect(resolveEditor({ EDITOR: "nano" })).toBe("nano");
    expect(resolveEditor({})).toBe("code");
  });
});

describe("editorCommand", () => {
  it("uses -g file:line for VS Code-family editors", () => {
    expect(editorCommand("code", "a.ts", 10)).toEqual({ cmd: "code", args: ["-g", "a.ts:10"] });
    expect(editorCommand("cursor", "a.ts", 3)).toEqual({ cmd: "cursor", args: ["-g", "a.ts:3"] });
  });

  it("uses +line file for terminal editors", () => {
    expect(editorCommand("vim", "a.ts", 12)).toEqual({ cmd: "vim", args: ["+12", "a.ts"] });
    expect(editorCommand("nano", "a.ts", 5)).toEqual({ cmd: "nano", args: ["+5", "a.ts"] });
  });

  it("uses file:line for sublime", () => {
    expect(editorCommand("subl", "a.ts", 9)).toEqual({ cmd: "subl", args: ["a.ts:9"] });
  });

  it("falls back to flags + file for an unknown editor", () => {
    expect(editorCommand("myeditor --wait", "a.ts", 9)).toEqual({ cmd: "myeditor", args: ["--wait", "a.ts"] });
  });
});

describe("editorOpenUrl", () => {
  it("builds a vscode:// deep link with the line for VS Code-family editors", () => {
    expect(editorOpenUrl("code", "/repo/a.ts", 42)).toBe("vscode://file/repo/a.ts:42");
    expect(editorOpenUrl("cursor", "/repo/a.ts", 7)).toBe("cursor://file/repo/a.ts:7");
    expect(editorOpenUrl("windsurf", "/repo/a.ts", 1)).toBe("windsurf://file/repo/a.ts:1");
  });

  it("falls back to a file:// URL for non-deep-link editors", () => {
    expect(editorOpenUrl("vim", "/repo/a.ts", 12)).toBe("file:///repo/a.ts");
    expect(editorOpenUrl("nano", "/repo/a.ts", 1)).toBe("file:///repo/a.ts");
  });

  it("normalizes a non-absolute path with a leading slash", () => {
    expect(editorOpenUrl("vim", "repo/a.ts", 1)).toBe("file:///repo/a.ts");
  });
});
