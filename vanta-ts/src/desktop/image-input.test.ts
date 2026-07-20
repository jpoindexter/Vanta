import { describe, expect, it } from "vitest";
import { parseDesktopImageInput } from "./image-input.js";

describe("desktop image input", () => {
  it("accepts supported image attachments and strips UI-only fields", () => {
    expect(parseDesktopImageInput([{ id: "preview", name: "capture.png", mime: "image/png", dataBase64: "AQID", bytes: 3 }])).toEqual({
      ok: true,
      images: [{ mime: "image/png", dataBase64: "AQID" }],
    });
  });

  it("preserves a validated native capture receipt", () => {
    const capture = { source: "macos-screencapture", capturedAt: "2026-07-20T12:00:00.000Z", expiresAt: "2026-07-20T12:05:00.000Z", scope: "abcdef123456", mode: "marquee", display: 1, bytes: 3, pixelWidth: 800, pixelHeight: 600 };
    expect(parseDesktopImageInput([{ mime: "image/png", dataBase64: "AQID", capture }], Date.parse("2026-07-20T12:01:00.000Z"))).toEqual({ ok: true, images: [{ mime: "image/png", dataBase64: "AQID", capture }] });
    expect(parseDesktopImageInput([{ mime: "image/png", dataBase64: "AQID", capture }], Date.parse("2026-07-20T12:05:00.000Z"))).toEqual({ ok: false, error: "image capture receipt is invalid" });
  });

  it("rejects forged capture metadata", () => {
    expect(parseDesktopImageInput([{ mime: "image/png", dataBase64: "AQID", capture: { source: "browser" } }])).toEqual({ ok: false, error: "image capture receipt is invalid" });
  });

  it("accepts a missing image collection", () => {
    expect(parseDesktopImageInput(undefined)).toEqual({ ok: true, images: [] });
  });

  it.each([
    ["non-array", {}, "images must be an array"],
    ["unsupported", [{ mime: "image/gif", dataBase64: "AQID" }], "images must be PNG, JPEG, or TIFF"],
    ["invalid base64", [{ mime: "image/png", dataBase64: "not base64" }], "image data must be valid base64"],
  ])("rejects %s input", (_label, value, error) => {
    expect(parseDesktopImageInput(value)).toEqual({ ok: false, error });
  });
});
