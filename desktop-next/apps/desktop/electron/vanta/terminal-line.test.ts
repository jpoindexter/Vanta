import { describe, expect, it } from "vitest";

import { feedInput, MAX_LINE, sanitizeOutput } from "./terminal-line";

const PROMPT = "p $ ";
const feed = (data: string, line = "") => feedInput({ line }, data, PROMPT);

describe("feedInput", () => {
  it("echoes typing and submits the line on Enter", () => {
    const typed = feed("ls -la");
    expect(typed).toMatchObject({ echo: "ls -la", state: { line: "ls -la" }, submitted: [] });

    expect(feedInput(typed.state, "\r", PROMPT)).toMatchObject({ echo: "\r\n", state: { line: "" }, submitted: ["ls -la"] });
  });

  it("treats a pasted block as several commands, in order, and handles CRLF as one Enter", () => {
    expect(feed("echo a\necho b\r\necho c").submitted).toEqual(["echo a", "echo b"]);
    expect(feed("echo a\necho b\r\necho c").state.line).toBe("echo c");
  });

  it("submits a blank line as the empty string so the prompt can be redrawn", () => {
    expect(feed("\r").submitted).toEqual([""]);
    expect(feed("   \r").submitted).toEqual([""]);
  });

  it("backspaces, and does nothing at the start of the line", () => {
    expect(feed("\u007f", "ab")).toMatchObject({ echo: "\b \b", state: { line: "a" } });
    expect(feed("\u007f", "")).toMatchObject({ echo: "", state: { line: "" } });
  });

  it("Ctrl-C clears the line and reports an interrupt without submitting anything", () => {
    expect(feed("\u0003", "rm something")).toMatchObject({ interrupt: true, state: { line: "" }, submitted: [] });
  });

  it("Ctrl-D ends the session only on an empty line", () => {
    expect(feed("\u0004", "").eof).toBe(true);
    expect(feed("\u0004", "x").eof).toBe(false);
  });

  it("Ctrl-U clears the line and redraws the prompt", () => {
    expect(feed("\u0015", "abc")).toMatchObject({ echo: `\r\u001b[2K${PROMPT}`, state: { line: "" } });
  });

  it("ignores arrow keys, bracketed-paste markers and other escape sequences instead of putting them in the command", () => {
    const result = feed("\u001b[A\u001b[200~echo hi\u001b[201~\u001b[1;5C\u001bO");

    expect(result.state.line).toBe("echo hi");
    expect(result.echo).toBe("echo hi");
  });

  it("ignores Tab and other control characters", () => {
    expect(feed("a\tb\u0001c").state.line).toBe("abc");
  });

  it("caps a line", () => {
    expect(feed("x".repeat(MAX_LINE + 50)).state.line).toHaveLength(MAX_LINE);
  });

  it("does not let an escape at the very end swallow later input", () => {
    expect(feed("a\u001b").state.line).toBe("a");
    expect(feed("\u001b[").state.line).toBe("");
  });
});

describe("sanitizeOutput", () => {
  it("strips colour, cursor and title sequences and normalises line ends", () => {
    expect(sanitizeOutput("\u001b[31mred\u001b[0m\n\u001b]0;evil title\u0007done\r\n", 1000)).toBe("red\r\ndone\r\n");
  });

  it("strips an OSC 52 clipboard write and an OSC 8 link", () => {
    expect(sanitizeOutput("a\u001b]52;c;ZXZpbA==\u0007b\u001b]8;;http://x\u001b\\link\u001b]8;;\u001b\\", 1000)).toBe("ablink");
  });

  it("removes bells, backspaces and other control characters but keeps tabs", () => {
    expect(sanitizeOutput("a\u0007b\u0008c\td\u0000", 1000)).toBe("abc\td");
  });

  it("turns a bare carriage return (a progress bar) into a line break", () => {
    expect(sanitizeOutput("10%\r20%\r30%", 1000)).toBe("10%\r\n20%\r\n30%");
  });

  it("cuts long output and says so", () => {
    const cut = sanitizeOutput("x".repeat(50), 10);

    expect(cut.startsWith("x".repeat(10))).toBe(true);
    expect(cut).toContain("[output cut at 10 characters]");
  });
});
