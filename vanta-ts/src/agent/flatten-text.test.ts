import { describe, it, expect } from "vitest";
import { flattenMessageText } from "./flatten-text.js";

// HARNESS-FLATTEN-TEXT — visible text from any content shape, media skipped.

describe("flattenMessageText", () => {
  it("returns a plain string unchanged", () => {
    expect(flattenMessageText("hello world")).toBe("hello world");
    expect(flattenMessageText("")).toBe("");
  });

  it("joins the text parts of a parts array", () => {
    expect(flattenMessageText([{ type: "text", text: "one" }, { type: "text", text: "two" }])).toBe("one\ntwo");
  });

  it("skips image/audio/tool parts, keeping only text", () => {
    const content = [
      { type: "text", text: "look at this" },
      { type: "image_url", image_url: { url: "data:..." } },
      { type: "input_audio", input_audio: { data: "..." } },
      { type: "text", text: "and this" },
    ];
    expect(flattenMessageText(content)).toBe("look at this\nand this");
  });

  it("probes the common text keys on an object", () => {
    expect(flattenMessageText({ type: "text", text: "via text" })).toBe("via text");
    expect(flattenMessageText({ output_text: "via output_text" })).toBe("via output_text");
    expect(flattenMessageText({ value: "via value" })).toBe("via value");
  });

  it("recurses into a nested parts array under a content key (Anthropic/Responses shape)", () => {
    const msg = { role: "assistant", content: [{ type: "text", text: "nested a" }, { type: "image", source: {} }, { type: "text", text: "nested b" }] };
    expect(flattenMessageText(msg)).toBe("nested a\nnested b");
  });

  it("returns empty string for media-only, null, numbers, or unknown shapes", () => {
    expect(flattenMessageText([{ type: "image", url: "x" }])).toBe("");
    expect(flattenMessageText(null)).toBe("");
    expect(flattenMessageText(undefined)).toBe("");
    expect(flattenMessageText(42)).toBe("");
    expect(flattenMessageText({ foo: "bar" })).toBe(""); // no text-ish key
  });

  it("handles a bare string element inside a parts array", () => {
    expect(flattenMessageText(["plain", { type: "text", text: "tagged" }])).toBe("plain\ntagged");
  });
});
