import { describe, it, expect, vi } from "vitest";
import { terminalOpenArgs, openVisibleTerminal } from "./visible-terminal.js";

describe("terminalOpenArgs", () => {
  it("builds a Terminal.app osascript on macOS attached to the session", () => {
    const r = terminalOpenArgs("vanta-abc", { platform: "darwin" });
    expect(r?.cmd).toBe("osascript");
    expect(r?.args.join(" ")).toContain("tmux attach -t vanta-abc");
    expect(r?.args.join(" ")).toContain("Terminal");
  });
  it("uses iTerm when TERM_PROGRAM is iTerm.app", () => {
    const r = terminalOpenArgs("vanta-abc", { platform: "darwin", termProgram: "iTerm.app" });
    expect(r?.args.join(" ")).toContain("iTerm");
    expect(r?.args.join(" ")).toContain("tmux attach -t vanta-abc");
  });
  it("builds an x-terminal-emulator command on linux", () => {
    const r = terminalOpenArgs("vanta-abc", { platform: "linux" });
    expect(r?.cmd).toBe("x-terminal-emulator");
    expect(r?.args).toContain("tmux attach -t vanta-abc");
  });
  it("returns null for an unknown platform", () => {
    expect(terminalOpenArgs("vanta-abc", { platform: "win32" })).toBeNull();
  });
  it("REFUSES an unsafe session name (no injection into the AppleScript/shell string)", () => {
    expect(terminalOpenArgs('a"; do shell script "rm -rf ~', { platform: "darwin" })).toBeNull();
    expect(terminalOpenArgs("a b", { platform: "darwin" })).toBeNull();
    expect(terminalOpenArgs("a$(whoami)", { platform: "linux" })).toBeNull();
  });
});

describe("openVisibleTerminal", () => {
  it("runs the launcher and returns ok", () => {
    const run = vi.fn();
    const r = openVisibleTerminal("vanta-abc", { platform: "darwin", run });
    expect(r).toEqual({ ok: true });
    expect(run).toHaveBeenCalledWith("osascript", expect.arrayContaining([expect.stringContaining("tmux attach -t vanta-abc")]));
  });
  it("returns an error (never throws) when no launcher exists for the platform", () => {
    const r = openVisibleTerminal("vanta-abc", { platform: "win32", run: () => {} });
    expect("error" in r).toBe(true);
  });
  it("returns an error (never throws) when the launcher fails", () => {
    const r = openVisibleTerminal("vanta-abc", { platform: "darwin", run: () => { throw new Error("boom"); } });
    expect(r).toEqual({ error: "boom" });
  });
});
