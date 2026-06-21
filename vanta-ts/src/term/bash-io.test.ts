import { describe, it, expect } from "vitest";
import { isBashTool, formatBashInput, formatBashOutput, bashIoMessages } from "./bash-io.js";

// Control/escape fixtures built from char codes so the test source stays printable.
const ESC = "\x1b";
const RED = `${ESC}[31m`; // CSI SGR
const RESET = `${ESC}[0m`;
const OSC_TITLE = `${ESC}]0;injected${ESC}\\`; // OSC set-title, ST-terminated
const BEL = "\x07";

describe("isBashTool", () => {
  it("is true for shell_cmd", () => {
    expect(isBashTool("shell_cmd")).toBe(true);
  });

  it("is true for run_code", () => {
    expect(isBashTool("run_code")).toBe(true);
  });

  it("is false for non-bash tools", () => {
    for (const name of ["read_file", "write_file", "web_fetch", "grep_files", "delegate", ""]) {
      expect(isBashTool(name)).toBe(false);
    }
  });
});

describe("formatBashInput", () => {
  it("prefixes a plain command with '$ '", () => {
    expect(formatBashInput("ls -la")).toBe("$ ls -la");
  });

  it("strips ANSI escapes from the command", () => {
    expect(formatBashInput(`${RED}rm${RESET} file`)).toBe("$ rm file");
  });

  it("strips OSC/title-injection escapes", () => {
    expect(formatBashInput(`${OSC_TITLE}echo hi`)).toBe("$ echo hi");
  });

  it("strips a bare BEL control char", () => {
    expect(formatBashInput(`echo${BEL} hi`)).toBe("$ echo hi");
  });

  it("collapses a multi-line command to a single line", () => {
    const out = formatBashInput("foo \\\n  bar\n  baz");
    expect(out.includes("\n")).toBe(false);
    expect(out.startsWith("$ ")).toBe(true);
  });

  it("returns '$' alone for an empty command", () => {
    expect(formatBashInput("")).toBe("$");
    expect(formatBashInput("   ")).toBe("$");
  });

  it("truncates a very long command with an ellipsis", () => {
    const out = formatBashInput("x".repeat(500));
    expect(out.length).toBeLessThanOrEqual(2 + 240); // "$ " + INPUT_MAX
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("formatBashOutput", () => {
  it("preserves newlines so multi-line output stays readable", () => {
    const out = formatBashOutput("line1\nline2\nline3");
    expect(out).toBe("line1\nline2\nline3");
    expect(out.split("\n")).toHaveLength(3);
  });

  it("strips ANSI escapes but keeps the surrounding text and newlines", () => {
    const out = formatBashOutput(`${RED}error${RESET}\nok`);
    expect(out).toBe("error\nok");
  });

  it("normalizes CRLF and bare CR to newlines", () => {
    expect(formatBashOutput("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("strips control chars while keeping newlines", () => {
    expect(formatBashOutput(`a${BEL}b\nc`)).toBe("ab\nc");
  });

  it("returns '' for empty / whitespace-only output", () => {
    expect(formatBashOutput("")).toBe("");
    expect(formatBashOutput("   \n  \t \n")).toBe("");
  });

  it("bounds the number of lines with a 'more lines' marker", () => {
    const many = Array.from({ length: 100 }, (_, i) => `row${i}`).join("\n");
    const out = formatBashOutput(many);
    const lines = out.split("\n");
    expect(lines.length).toBeLessThanOrEqual(41); // 40 kept + 1 marker
    expect(lines.at(-1)).toContain("more lines");
  });

  it("hard-bounds total chars on one giant line", () => {
    const out = formatBashOutput("y".repeat(10000));
    expect(out.length).toBeLessThanOrEqual(4000);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("bashIoMessages", () => {
  it("returns distinct input + output for a bash tool", () => {
    const msg = bashIoMessages("shell_cmd", "ls -la", "file1\nfile2");
    expect(msg).toEqual({ input: "$ ls -la", output: "file1\nfile2" });
  });

  it("returns input + output for run_code too", () => {
    const msg = bashIoMessages("run_code", "print('hi')", "hi");
    expect(msg).not.toBeNull();
    expect(msg?.input).toBe("$ print('hi')");
    expect(msg?.output).toBe("hi");
  });

  it("returns null for a non-bash tool (render as today)", () => {
    expect(bashIoMessages("read_file", "anything", "anything")).toBeNull();
    expect(bashIoMessages("web_fetch", "https://x", "<html>")).toBeNull();
  });

  it("strips escapes from both input and output in one pass", () => {
    const msg = bashIoMessages("shell_cmd", `${RED}whoami${RESET}`, `${OSC_TITLE}root\nstaff`);
    expect(msg).toEqual({ input: "$ whoami", output: "root\nstaff" });
  });

  it("handles an empty command + empty output", () => {
    expect(bashIoMessages("shell_cmd", "", "")).toEqual({ input: "$", output: "" });
  });
});
