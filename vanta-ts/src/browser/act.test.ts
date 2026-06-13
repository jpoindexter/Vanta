import { describe, it, expect } from "vitest";
import {
  BrowserActionSchema,
  classifyAction,
  describeAction,
  previewActions,
  riskyActions,
  type BrowserAction,
} from "./act.js";

describe("classifyAction", () => {
  it("treats navigation, scroll, wait, and a plain key as safe", () => {
    const safe: BrowserAction[] = [
      { type: "navigate", url: "https://example.com" },
      { type: "scroll" },
      { type: "wait", ms: 500 },
      { type: "press", key: "Tab" },
    ];
    for (const a of safe) expect(classifyAction(a).risk).toBe("safe");
  });

  it("flags a click on an irreversible control as risky with a reason", () => {
    const buy = classifyAction({ type: "click", text: "Buy now" });
    expect(buy.risk).toBe("risky");
    expect((buy.reason ?? "").toLowerCase()).toContain("buy");

    expect(classifyAction({ type: "click", selector: "#submit-order" }).risk).toBe("risky");
    expect(classifyAction({ type: "click", selector: ".delete-account" }).risk).toBe("risky");
  });

  it("treats a benign click as safe", () => {
    expect(classifyAction({ type: "click", text: "Read more" }).risk).toBe("safe");
    expect(classifyAction({ type: "click", selector: "#next-page" }).risk).toBe("safe");
  });

  it("flags secret entry and Enter (form submit) as risky", () => {
    expect(classifyAction({ type: "type", selector: "#pw", value: "x", secret: true }).risk).toBe(
      "risky",
    );
    expect(classifyAction({ type: "type", selector: "#q", value: "hi" }).risk).toBe("safe");
    expect(classifyAction({ type: "press", key: "Enter" }).risk).toBe("risky");
  });
});

describe("describeAction", () => {
  it("masks secret values, never leaking the text", () => {
    const line = describeAction({ type: "type", selector: "#pw", value: "hunter2", secret: true });
    expect(line).not.toContain("hunter2");
    expect(line).toContain("••••");
  });

  it("renders a text-target click via the text= engine form", () => {
    expect(describeAction({ type: "click", text: "Sign in" })).toBe("click → text=Sign in");
  });
});

describe("riskyActions + previewActions", () => {
  const seq: BrowserAction[] = [
    { type: "navigate", url: "https://shop.test" },
    { type: "type", selector: "#card", value: "4242", secret: true },
    { type: "click", text: "Place order" },
    { type: "scroll" },
  ];

  it("returns only the risky steps with 1-based positions", () => {
    const risky = riskyActions(seq);
    expect(risky.map((r) => r.index)).toEqual([2, 3]);
    expect(risky[0]?.reason ?? "").toContain("credential");
  });

  it("previews every step, flagging risky ones with ⚠ and masking secrets", () => {
    const preview = previewActions(seq);
    expect(preview).toContain("1. navigate → https://shop.test");
    expect(preview).toContain("⚠");
    expect(preview).not.toContain("4242");
    // safe steps carry no warning marker
    expect(preview).toMatch(/4\. scroll/);
  });
});

describe("BrowserActionSchema", () => {
  it("rejects an unknown action type", () => {
    expect(BrowserActionSchema.safeParse({ type: "drag" }).success).toBe(false);
  });

  it("rejects a navigate without a valid url", () => {
    expect(BrowserActionSchema.safeParse({ type: "navigate", url: "nope" }).success).toBe(false);
  });

  it("accepts a well-formed type action", () => {
    expect(
      BrowserActionSchema.safeParse({ type: "type", selector: "#q", value: "hi" }).success,
    ).toBe(true);
  });
});
