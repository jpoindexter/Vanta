import { describe, it, expect } from "vitest";
import { vim, resolveVim, nextVim } from "./vim-cmd.js";
import type { ReplCtx } from "./types.js";

// /vim toggles composer vi-mode. We assert the pure decision + the vimMode signal;
// persistence (setConfig → .env) is covered by config.test.ts. dataDir is a tmp
// path so the best-effort setConfig write can't touch the real repo.

function ctx(env: Record<string, string> = {}): ReplCtx {
  return { env, dataDir: "/tmp/vanta-vim-test/.vanta" } as unknown as ReplCtx;
}

describe("resolveVim", () => {
  it("defaults to off when unset", () => expect(resolveVim({})).toBe(false));
  it("is on for 1/on/true (case-insensitive)", () => {
    expect(resolveVim({ VANTA_VIM: "1" })).toBe(true);
    expect(resolveVim({ VANTA_VIM: "on" })).toBe(true);
    expect(resolveVim({ VANTA_VIM: "TRUE" })).toBe(true);
  });
  it("is off for anything else", () => {
    expect(resolveVim({ VANTA_VIM: "0" })).toBe(false);
    expect(resolveVim({ VANTA_VIM: "off" })).toBe(false);
    expect(resolveVim({ VANTA_VIM: "garbage" })).toBe(false);
  });
});

describe("nextVim", () => {
  it("toggles on empty/toggle arg", () => {
    expect(nextVim(false, "")).toEqual({ next: true });
    expect(nextVim(true, "toggle")).toEqual({ next: false });
  });
  it("sets explicitly on/off", () => {
    expect(nextVim(false, "on")).toEqual({ next: true });
    expect(nextVim(true, "off")).toEqual({ next: false });
  });
  it("errors on an unknown arg", () => {
    expect(nextVim(false, "maybe")).toEqual({ error: expect.stringContaining("unknown arg") });
  });
});

describe("/vim", () => {
  it("toggles on from the default and emits vimMode:true", async () => {
    const r = await vim("", ctx());
    expect(r.vimMode).toBe(true);
    expect(r.output).toContain("on");
  });
  it("emits vimMode:false when turning off", async () => {
    const r = await vim("off", ctx({ VANTA_VIM: "1" }));
    expect(r.vimMode).toBe(false);
    expect(r.output).toContain("off");
  });
  it("is a no-op (no signal) when already in the requested state", async () => {
    const r = await vim("on", ctx({ VANTA_VIM: "1" }));
    expect(r.vimMode).toBeUndefined();
    expect(r.output).toContain("already");
  });
  it("rejects an unknown arg without a signal", async () => {
    const r = await vim("sometimes", ctx());
    expect(r.vimMode).toBeUndefined();
    expect(r.output).toContain("unknown arg");
  });
});
