import { describe, it, expect, vi } from "vitest";
import {
  buildTerminalTitle,
  titleSequence,
  titleEnabled,
  setTerminalTitle,
} from "./terminal-title.js";

const env = (o: Record<string, string | undefined>): NodeJS.ProcessEnv => o as NodeJS.ProcessEnv;

describe("buildTerminalTitle", () => {
  it("brands the title with the active task", () => {
    expect(buildTerminalTitle(["fix the kernel bug"])).toBe("Vanta — fix the kernel bug");
  });

  it("falls back to the brand alone with no usable part", () => {
    expect(buildTerminalTitle([])).toBe("Vanta");
    expect(buildTerminalTitle([""])).toBe("Vanta");
    expect(buildTerminalTitle(["   "])).toBe("Vanta");
  });

  it("drops empty parts and joins the rest", () => {
    expect(buildTerminalTitle(["", "ship v1", ""])).toBe("Vanta — ship v1");
    expect(buildTerminalTitle(["20260620-101500", "ship v1"])).toBe("Vanta — 20260620-101500 — ship v1");
  });

  it("collapses internal whitespace to single spaces", () => {
    expect(buildTerminalTitle(["fix   the\tbug"])).toBe("Vanta — fix the bug");
  });

  it("truncates past the max length with an ellipsis", () => {
    const long = "x".repeat(200);
    const out = buildTerminalTitle([long]);
    expect(out.length).toBe(80);
    expect(out.endsWith("…")).toBe(true);
    expect(out.startsWith("Vanta — ")).toBe(true);
  });

  it("strips control chars so a task name cannot inject an escape", () => {
    const malicious = "evil\x1b]0;HIJACKED\x07rest\nmore";
    const out = buildTerminalTitle([malicious]);
    expect(out).not.toContain("\x1b");
    expect(out).not.toContain("\x07");
    expect(out).not.toContain("\n");
    // the stripped ESC/BEL/newline each become a space, then collapse
    expect(out).toBe("Vanta — evil ]0;HIJACKED rest more");
  });

  it("strips a bare BEL/DEL/null so the sequence stays one line", () => {
    expect(buildTerminalTitle(["a\x07b\x7fc\x00d"])).toBe("Vanta — a b c d");
  });
});

describe("titleSequence", () => {
  it("wraps the title in the OSC-0 set-title escape", () => {
    expect(titleSequence("Vanta — go")).toBe("\x1b]0;Vanta — go\x07");
  });
});

describe("titleEnabled", () => {
  it("is on by default for a TTY", () => {
    expect(titleEnabled(env({}), true)).toBe(true);
  });

  it("is off when not a TTY (piped/captured output)", () => {
    expect(titleEnabled(env({}), false)).toBe(false);
    expect(titleEnabled(env({ VANTA_TERMINAL_TITLE: "1" }), false)).toBe(false);
  });

  it("honors VANTA_TERMINAL_TITLE=0/false to disable on a TTY", () => {
    expect(titleEnabled(env({ VANTA_TERMINAL_TITLE: "0" }), true)).toBe(false);
    expect(titleEnabled(env({ VANTA_TERMINAL_TITLE: "false" }), true)).toBe(false);
  });
});

describe("setTerminalTitle", () => {
  it("writes the escape when enabled", () => {
    const write = vi.fn();
    setTerminalTitle(["ship v1"], { write, env: env({}), isTTY: true });
    expect(write).toHaveBeenCalledWith("\x1b]0;Vanta — ship v1\x07");
  });

  it("no-ops when not a TTY", () => {
    const write = vi.fn();
    setTerminalTitle(["ship v1"], { write, env: env({}), isTTY: false });
    expect(write).not.toHaveBeenCalled();
  });

  it("no-ops when disabled via VANTA_TERMINAL_TITLE=0", () => {
    const write = vi.fn();
    setTerminalTitle(["ship v1"], { write, env: env({ VANTA_TERMINAL_TITLE: "0" }), isTTY: true });
    expect(write).not.toHaveBeenCalled();
  });

  it("never throws when the writer fails (best-effort)", () => {
    const write = vi.fn(() => {
      throw new Error("stdout closed");
    });
    expect(() => setTerminalTitle(["go"], { write, env: env({}), isTTY: true })).not.toThrow();
  });

  it("strips an injected escape from the task name before writing", () => {
    const write = vi.fn();
    setTerminalTitle(["safe\x1b]0;EVIL\x07"], { write, env: env({}), isTTY: true });
    const written = write.mock.calls[0]?.[0] as string;
    // exactly one OSC-0 opener and one BEL terminator — the injected pair is gone
    expect(written.match(/\x1b\]0;/g)?.length).toBe(1);
    expect(written.match(/\x07/g)?.length).toBe(1);
    expect(written).toBe("\x1b]0;Vanta — safe ]0;EVIL\x07");
  });
});
