import { describe, expect, it } from "vitest";
import { activeImageAttachments, isActiveCapture } from "./capture-expiry.js";

const capture = {
  source: "macos-screencapture" as const,
  capturedAt: "2026-07-20T12:00:00.000Z",
  expiresAt: "2026-07-20T12:05:00.000Z",
  scope: "abcdef123456",
  mode: "screen" as const,
  display: 1,
  bytes: 3,
};

describe("capture expiry", () => {
  it("accepts a capture only inside its declared lifetime", () => {
    expect(isActiveCapture(capture, Date.parse("2026-07-20T12:04:59.000Z"))).toBe(true);
    expect(isActiveCapture(capture, Date.parse("2026-07-20T12:05:00.000Z"))).toBe(false);
  });

  it("drops expired captures without dropping ordinary image attachments", () => {
    const ordinary = { mime: "image/png", dataBase64: "AQID" };
    const expired = { ...ordinary, capture };
    expect(activeImageAttachments([expired, ordinary], Date.parse("2026-07-20T12:06:00.000Z"))).toEqual([ordinary]);
  });
});
