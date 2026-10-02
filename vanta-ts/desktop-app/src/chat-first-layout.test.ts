import { describe, expect, it } from "vitest";
import { paneWidth, resizedWidth } from "./chat-first-layout.js";

describe("workbench pane geometry", () => {
  it("clamps stored values and recovers invalid preferences", () => {
    expect(paneWidth("sidebar", NaN)).toBe(260);
    expect(paneWidth("context", 0)).toBe(560);
    expect(paneWidth("sidebar", 900)).toBe(360);
    expect(paneWidth("context", 100)).toBe(300);
  });
  it("supports mirrored keyboard resize, endpoints and unrelated keys", () => {
    expect(resizedWidth("sidebar", 260, { key: "ArrowRight", shiftKey: false })).toBe(276);
    expect(resizedWidth("context", 360, { key: "ArrowLeft", shiftKey: true })).toBe(392);
    expect(resizedWidth("context", 360, { key: "Home", shiftKey: false })).toBe(300);
    expect(resizedWidth("context", 360, { key: "End", shiftKey: false })).toBe(800);
    expect(resizedWidth("context", 360, { key: "Tab", shiftKey: false })).toBeUndefined();
  });
});
