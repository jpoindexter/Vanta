import { describe, it, expect } from "vitest";
import { parseShortcut, runBashShortcut } from "./shortcuts.js";
import type { SafetyClient } from "../safety-client.js";

// ── parseShortcut ──────────────────────────────────────────────────────────

describe("parseShortcut", () => {
  it("returns bash shortcut for !cmd", () => {
    expect(parseShortcut("!ls -la")).toEqual({ type: "bash", cmd: "ls -la" });
  });

  it("trims leading whitespace after !", () => {
    expect(parseShortcut("!  echo hello")).toEqual({ type: "bash", cmd: "echo hello" });
  });

  it("returns null for bare ! with no command", () => {
    expect(parseShortcut("!")).toBeNull();
  });

  it("returns null for ! followed only by whitespace", () => {
    expect(parseShortcut("!   ")).toBeNull();
  });

  it("returns memory shortcut for #text", () => {
    expect(parseShortcut("#hello world")).toEqual({ type: "memory", text: "hello world" });
  });

  it("trims leading whitespace after #", () => {
    expect(parseShortcut("#  remember this")).toEqual({ type: "memory", text: "remember this" });
  });

  it("returns null for bare # with no text", () => {
    expect(parseShortcut("#")).toBeNull();
  });

  it("returns null for # followed only by whitespace", () => {
    expect(parseShortcut("#   ")).toBeNull();
  });

  it("returns null for regular text", () => {
    expect(parseShortcut("hello world")).toBeNull();
  });

  it("returns null for slash commands", () => {
    expect(parseShortcut("/memory foo")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseShortcut("")).toBeNull();
  });
});

// ── runBashShortcut ────────────────────────────────────────────────────────

function fakeSafety(risk: "allow" | "ask" | "block"): SafetyClient {
  return { assess: async () => ({ risk, needsHuman: false, reason: "test reason" }) } as unknown as SafetyClient;
}

describe("runBashShortcut", () => {
  it("runs the command and returns output when allowed", async () => {
    const out = await runBashShortcut("echo hello", fakeSafety("allow"), process.cwd());
    expect(out).toContain("$ echo hello");
    expect(out).toContain("hello");
  });

  it("returns blocked message without running when verdict is block", async () => {
    const out = await runBashShortcut("rm -rf /", fakeSafety("block"), process.cwd());
    expect(out).toMatch(/✗ blocked:/);
    expect(out).not.toContain("$ ");
  });

  it("runs with warning prefix when verdict is ask", async () => {
    const out = await runBashShortcut("echo risky", fakeSafety("ask"), process.cwd());
    expect(out).toContain("⚠ risky");
    expect(out).toContain("echo risky");
    expect(out).toContain("risky");
  });

  it("shows (no output) for commands that produce nothing", async () => {
    const out = await runBashShortcut("true", fakeSafety("allow"), process.cwd());
    expect(out).toContain("(no output)");
  });

  it("shows error for a failing command", async () => {
    const out = await runBashShortcut("exit 1", fakeSafety("allow"), process.cwd());
    expect(out).toMatch(/✗/);
  });
});
