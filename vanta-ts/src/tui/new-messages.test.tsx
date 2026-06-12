import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { render } from "./test-render.js";
import { isAtBottom, unseenCount } from "./new-messages.js";
import { NewMessagesPill } from "./new-messages-pill.js";

describe("isAtBottom", () => {
  it("is true when the viewport reaches the content bottom", () => {
    expect(isAtBottom(90, 100, 10)).toBe(true);
  });
  it("is true within the one-line epsilon", () => {
    expect(isAtBottom(89, 100, 10)).toBe(true);
  });
  it("is false when scrolled up", () => {
    expect(isAtBottom(50, 100, 10)).toBe(false);
  });
});

describe("unseenCount", () => {
  it("counts entries beyond the baseline", () => {
    expect(unseenCount(12, 8)).toBe(4);
  });
  it("never goes negative", () => {
    expect(unseenCount(5, 8)).toBe(0);
  });
});

describe("NewMessagesPill", () => {
  it("renders nothing when count is zero", () => {
    const inst = render(h(NewMessagesPill, { count: 0, accent: "cyan", width: 40 }));
    expect(inst.lastFrame().trim()).toBe("");
    inst.unmount();
  });
  it("renders a singular label for one message", () => {
    const inst = render(h(NewMessagesPill, { count: 1, accent: "cyan", width: 40 }));
    const out = inst.lastFrame();
    expect(out).toContain("1 new message");
    expect(out).not.toContain("messages");
    inst.unmount();
  });
  it("renders a plural label + follow hint", () => {
    const inst = render(h(NewMessagesPill, { count: 3, accent: "cyan", width: 40 }));
    const out = inst.lastFrame();
    expect(out).toContain("3 new messages");
    expect(out).toContain("^end to follow");
    inst.unmount();
  });
});
