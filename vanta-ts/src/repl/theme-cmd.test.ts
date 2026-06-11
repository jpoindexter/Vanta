import { describe, it, expect } from "vitest";
import { theme } from "./theme-cmd.js";
import type { ReplCtx } from "./types.js";

// The handler only reads ctx.env, so a minimal ctx suffices.
const ctx = (env: Record<string, string> = {}): ReplCtx => ({ env } as unknown as ReplCtx);

describe("/theme command", () => {
  it("lists the real themes (with the current one marked) when given no arg", async () => {
    const r = await theme("", ctx({ VANTA_THEME: "muted" }));
    expect(r.output).toContain("current: muted");
    expect(r.output).toContain("default");
    expect(r.output).toContain("high-contrast");
    expect(r.output).toContain("dyslexia");
    expect(r.theme).toBeUndefined(); // listing doesn't switch
  });

  it("returns a theme signal for a valid name so the host restyles live", async () => {
    const r = await theme("dyslexia", ctx({}));
    expect(r.theme).toBe("dyslexia");
    expect(r.output).toContain("theme set to dyslexia");
  });

  it("is case-insensitive on the chosen name", async () => {
    const r = await theme("High-Contrast", ctx({}));
    expect(r.theme).toBe("high-contrast");
  });

  it("rejects an unknown theme without switching", async () => {
    const r = await theme("neon", ctx({}));
    expect(r.theme).toBeUndefined();
    expect(r.output).toContain("unknown theme 'neon'");
  });

  it("no-ops when the chosen theme is already active", async () => {
    const r = await theme("muted", ctx({ VANTA_THEME: "muted" }));
    expect(r.theme).toBeUndefined();
    expect(r.output).toContain("already on theme muted");
  });
});
