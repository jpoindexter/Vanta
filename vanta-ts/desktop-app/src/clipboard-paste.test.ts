import { describe, expect, it } from "vitest";
import { clipboardFilesToImages, clipboardImageFiles, insertClipboardText, mergeClipboardImages } from "./clipboard-paste.js";

describe("desktop clipboard paste", () => {
  it("inserts text at the selection and places the cursor after it", () => {
    expect(insertClipboardText("hello world", "Vanta", 6, 11)).toEqual({ value: "hello Vanta", cursor: 11 });
  });

  it("extracts image files once from clipboard items", () => {
    const image = new File([new Uint8Array([1, 2, 3])], "capture.png", { type: "image/png", lastModified: 1 });
    const data = {
      items: [{ kind: "file", type: "image/png", getAsFile: () => image }],
      files: [image],
    } as unknown as DataTransfer;
    expect(clipboardImageFiles(data)).toEqual([image]);
  });

  it("encodes supported files and rejects unsupported or oversized media", async () => {
    const png = new File([new Uint8Array([1, 2, 3])], "capture.png", { type: "image/png" });
    const jpeg = new File([new Uint8Array([4, 5])], "photo.jpg", { type: "image/jpeg" });
    const tiff = new File([new Uint8Array([6])], "scan.tiff", { type: "image/tiff" });
    const gif = new File([new Uint8Array([4])], "moving.gif", { type: "image/gif" });
    const oversized = new File([new Uint8Array(5)], "large.jpg", { type: "image/jpeg" });
    const result = await clipboardFilesToImages([png, jpeg, tiff, gif, oversized], 4);
    expect(result.images).toHaveLength(3);
    expect(result.images[0]).toMatchObject({ name: "capture.png", mime: "image/png", dataBase64: "AQID", bytes: 3 });
    expect(result.images[1]).toMatchObject({ name: "photo.jpg", mime: "image/jpeg", dataBase64: "BAU=", bytes: 2 });
    expect(result.images[2]).toMatchObject({ name: "scan.tiff", mime: "image/tiff", dataBase64: "Bg==", bytes: 1 });
    expect(result.errors).toEqual(["moving.gif is not PNG, JPEG, or TIFF.", "large.jpg is larger than 0 MB."]);
  });

  it("deduplicates repeated paste events without dropping distinct images", async () => {
    const first = (await clipboardFilesToImages([new File(["same"], "one.png", { type: "image/png" })])).images[0];
    const duplicate = { ...first, id: "different-event" };
    const second = (await clipboardFilesToImages([new File(["other"], "two.png", { type: "image/png" })])).images[0];
    expect(mergeClipboardImages([first], [duplicate, second])).toEqual([first, second]);
  });
});
