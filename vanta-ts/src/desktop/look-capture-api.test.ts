import { describe, expect, it, vi } from "vitest";
import { desktopLookCapture } from "./look-capture-api.js";

describe("desktop look capture API", () => {
  it("returns captured images from the shared scoped boundary", async () => {
    const capture = vi.fn(async () => ({ status: "captured" as const, images: [] }));
    await expect(desktopLookCapture("/project", "window", capture)).resolves.toEqual({ status: 200, body: { status: "captured", images: [] } });
    expect(capture).toHaveBeenCalledWith({ mode: "window", scope: "/project" });
  });

  it("maps cancellation, denial, oversize, and invalid modes", async () => {
    await expect(desktopLookCapture("/project", "marquee", async () => ({ status: "cancelled" }))).resolves.toMatchObject({ status: 200 });
    await expect(desktopLookCapture("/project", "screen", async () => ({ status: "denied", recovery: "grant access" }))).resolves.toMatchObject({ status: 403 });
    await expect(desktopLookCapture("/project", "screen", async () => ({ status: "oversized", recovery: "smaller", bytes: 99 }))).resolves.toMatchObject({ status: 413 });
    await expect(desktopLookCapture("/project", "camera")).resolves.toMatchObject({ status: 400 });
  });
});
