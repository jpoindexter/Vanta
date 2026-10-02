import { describe, expect, it } from "vitest";
import { appendAttachmentReferences } from "./attachment-text.js";

describe("shared attachment references", () => {
  it("does not multiply a recorded input when preparing and then sending a replay", () => {
    const prepared = appendAttachmentReferences("Read reference\n@guide.md", ["guide.md"]);
    expect(appendAttachmentReferences(prepared, ["guide.md"])).toBe("Read reference\n@guide.md");
  });
  it("keeps inline discussion intact and adds only missing references", () => {
    expect(appendAttachmentReferences("Discuss @guide.md inline", ["guide.md", "guide.md", "notes.md"]))
      .toBe("Discuss @guide.md inline\n@guide.md\n@notes.md");
  });
});
