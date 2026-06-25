import { describe, it, expect } from "vitest";
import { composer } from "./composer-cmd.js";
import { resolveComposerAnchor } from "../ui/pinned-region.js";
import type { ReplCtx } from "./types.js";

// /composer toggles the input box position. We assert the pure decision + signal;
// persistence (setConfig → .env) is exercised by config.test.ts. dataDir points at
// a tmp path so the best-effort setConfig write can't touch the real repo.

function ctx(env: Record<string, string> = {}): ReplCtx {
  return { env, dataDir: "/tmp/vanta-composer-test/.vanta" } as unknown as ReplCtx;
}

describe("resolveComposerAnchor", () => {
  it("defaults to bottom when unset (input rides the terminal floor)", () => {
    expect(resolveComposerAnchor({})).toBe("bottom");
  });
  it("returns float only for an explicit 'float' (case-insensitive); else bottom", () => {
    expect(resolveComposerAnchor({ VANTA_COMPOSER_ANCHOR: "float" })).toBe("float");
    expect(resolveComposerAnchor({ VANTA_COMPOSER_ANCHOR: "FLOAT" })).toBe("float");
    expect(resolveComposerAnchor({ VANTA_COMPOSER_ANCHOR: "bottom" })).toBe("bottom");
    expect(resolveComposerAnchor({ VANTA_COMPOSER_ANCHOR: "garbage" })).toBe("bottom");
  });
});

describe("/composer", () => {
  it("lists modes and marks the current one (bottom) when called with no arg", async () => {
    const r = await composer("", ctx());
    expect(r.output).toContain("current: bottom");
    expect(r.output).toContain("float");
    expect(r.output).toContain("bottom");
    expect(r.composerAnchor).toBeUndefined();
  });

  it("emits a composerAnchor signal switching away from the default (to float)", async () => {
    const r = await composer("float", ctx());
    expect(r.composerAnchor).toBe("float");
    expect(r.output).toContain("float");
  });

  it("is a no-op when already on the requested mode", async () => {
    const r = await composer("bottom", ctx({ VANTA_COMPOSER_ANCHOR: "bottom" }));
    expect(r.composerAnchor).toBeUndefined();
    expect(r.output).toContain("already");
  });

  it("rejects an unknown mode without a signal", async () => {
    const r = await composer("middle", ctx());
    expect(r.composerAnchor).toBeUndefined();
    expect(r.output).toContain("unknown mode");
  });
});
