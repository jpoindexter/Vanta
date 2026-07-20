import { describe, expect, it } from "vitest";
import { parseDesktopImageInput } from "./image-input.js";

describe("desktop image input", () => {
  it("accepts supported image attachments and strips UI-only fields", () => {
    expect(parseDesktopImageInput([{ id: "preview", name: "capture.png", mime: "image/png", dataBase64: "AQID", bytes: 3 }])).toEqual({
      ok: true,
      images: [{ mime: "image/png", dataBase64: "AQID" }],
    });
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
