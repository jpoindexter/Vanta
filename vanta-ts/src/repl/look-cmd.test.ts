import { describe, expect, it, vi } from "vitest";
import { createLookHandler, parseLookMode } from "./look-cmd.js";
import type { ReplCtx, ReplState } from "./types.js";

describe("/look", () => {
  it("defaults to marquee and attaches captures with receipts", async () => {
    const capture = vi.fn(async () => ({ status: "captured" as const, images: [{
      name: "look-marquee.png",
      mime: "image/png",
      dataBase64: "AAAA",
      capture: { source: "macos-screencapture" as const, capturedAt: "2026-07-20T12:00:00.000Z", expiresAt: "2026-07-20T12:05:00.000Z", scope: "abcdef123456", mode: "marquee" as const, display: 1, bytes: 3, pixelWidth: 800, pixelHeight: 600 },
    }] }));
    const state: ReplState = { sessionId: "s", started: "2026-07-20T12:00:00.000Z", turnIndex: 0 };
    const result = await createLookHandler(capture)("", { dataDir: "/tmp/project/.vanta", state } as ReplCtx);
    expect(capture).toHaveBeenCalledWith({ mode: "marquee", scope: "/tmp/project" });
    expect(state.pendingImages).toHaveLength(1);
    expect(result.output).toContain("receipt: macos-screencapture");
  });

  it("does not attach or send on cancellation", async () => {
    const state: ReplState = { sessionId: "s", started: "2026-07-20T12:00:00.000Z", turnIndex: 0 };
    const result = await createLookHandler(async () => ({ status: "cancelled" }))("window", { dataDir: "/tmp/.vanta", state } as ReplCtx);
    expect(state.pendingImages).toBeUndefined();
    expect(result.output).toContain("nothing attached or sent");
  });

  it("parses the three explicit scopes", () => {
    expect(parseLookMode("full")).toBe("screen");
    expect(parseLookMode("window")).toBe("window");
    expect(parseLookMode("selection")).toBe("marquee");
    expect(parseLookMode("camera")).toBeNull();
  });
});
