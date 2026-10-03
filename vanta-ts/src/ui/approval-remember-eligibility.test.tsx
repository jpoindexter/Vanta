import { createElement as h } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalPrompt, decide } from "./approval-prompt.js";
import { grantAlways, grantNever } from "./grant.js";
import { renderUi, waitForFrame, waitUntil } from "./test-render.js";

vi.mock("./grant.js", () => ({ grantAlways: vi.fn(), grantNever: vi.fn() }));

const unnamedRequest = () => ({
  action: "Navigate the browser to https://example.com",
  reason: "domain is not in VANTA_ALLOWED_DOMAINS — visiting it loads remote content",
  resolve: vi.fn(),
});

beforeEach(() => { vi.clearAllMocks(); });

describe("Ink remembered-choice eligibility", () => {
  it("shows only one-time choices for an unnamed inner browser request", async () => {
    const pending = unnamedRequest();
    const onDone = vi.fn();
    const ui = renderUi(h(ApprovalPrompt, { pending, onDone }));
    try {
      const frame = await waitForFrame(ui, "Do you want to proceed?");
      expect(frame).toContain("Yes, just once");
      expect(frame).not.toContain("don't ask again");
      expect(frame).not.toContain("Never allow this tool");
      ui.input("\r");
      await waitUntil(() => pending.resolve.mock.calls.length > 0);
      expect(pending.resolve).toHaveBeenCalledExactlyOnceWith(true);
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(grantAlways).not.toHaveBeenCalled();
      expect(grantNever).not.toHaveBeenCalled();
    } finally { ui.unmount(); }
  });

  it("uses the remaining numbered deny choice without attempting persistence", async () => {
    const pending = unnamedRequest();
    const ui = renderUi(h(ApprovalPrompt, { pending, onDone: vi.fn() }));
    try {
      await waitForFrame(ui, "Do you want to proceed?");
      ui.input("2");
      await waitUntil(() => pending.resolve.mock.calls.length > 0);
      expect(pending.resolve).toHaveBeenCalledExactlyOnceWith(false);
      expect(grantAlways).not.toHaveBeenCalled();
      expect(grantNever).not.toHaveBeenCalled();
    } finally { ui.unmount(); }
  });

  it("does not offer either saved choice or task continuation for a fresh named request", async () => {
    const pending = { ...unnamedRequest(), toolName: "browser_act", fresh: true, canContinueTask: true };
    const ui = renderUi(h(ApprovalPrompt, { pending, onDone: vi.fn() }));
    try {
      const frame = await waitForFrame(ui, "Do you want to proceed?");
      expect(frame).toContain("Yes, just once");
      expect(frame).not.toContain("don't ask again");
      expect(frame).not.toContain("Never allow this tool");
      expect(frame).not.toContain("go ahead with this task");
    } finally { ui.unmount(); }
  });

  it("retains the existing named ordinary-tool save decision", async () => {
    const pending = { ...unnamedRequest(), toolName: "browser_read" };
    const ui = renderUi(h(ApprovalPrompt, { pending, onDone: vi.fn() }));
    try {
      const frame = await waitForFrame(ui, "don't ask again");
      expect(frame).toContain("Never allow this tool");
      ui.input("2");
      await waitUntil(() => pending.resolve.mock.calls.length > 0);
      expect(grantAlways).toHaveBeenCalledExactlyOnceWith("browser_read");
      expect(pending.resolve).toHaveBeenCalledExactlyOnceWith(true);
      expect(grantNever).not.toHaveBeenCalled();
    } finally { ui.unmount(); }
  });
});

describe("unnamed decision defense", () => {
  it.each(["always", "never"] as const)("still rejects a direct %s decision without a tool name", async (decision) => {
    const pending = unnamedRequest();
    await expect(decide(pending, decision)).rejects.toThrow("without a tool name");
    expect(pending.resolve).not.toHaveBeenCalled();
    expect(grantAlways).not.toHaveBeenCalled();
    expect(grantNever).not.toHaveBeenCalled();
  });
});

it("a forged Never decision for a fresh request denies once without saving a rule", async () => {
  const pending = { ...unnamedRequest(), toolName: "browser_act", fresh: true };
  await decide(pending, "never");
  expect(pending.resolve).toHaveBeenCalledExactlyOnceWith(false);
  expect(grantAlways).not.toHaveBeenCalled();
  expect(grantNever).not.toHaveBeenCalled();
});

describe("each-time policy decisions", () => {
  const restrictedRequest = () => ({
    ...unnamedRequest(), toolName: "browser_read", canRemember: false,
    reason: "Your saved operator profile requires approval every time for this tool.",
    canContinueTask: true, grantTask: vi.fn(),
  });

  it("shows a truthful one-time choice even when a stale task choice is present", async () => {
    const pending = restrictedRequest();
    const ui = renderUi(h(ApprovalPrompt, { pending, onDone: vi.fn() }));
    try {
      const frame = await waitForFrame(ui, "Do you want to proceed?");
      expect(frame).toContain("requires approval every time");
      expect(frame).toContain("Yes, just once");
      expect(frame).not.toContain("don't ask again");
      expect(frame).not.toContain("Never allow this tool");
      expect(frame).not.toContain("go ahead with this task");
      ui.input("\r");
      await waitUntil(() => pending.resolve.mock.calls.length > 0);
      expect(pending.resolve).toHaveBeenCalledExactlyOnceWith(true);
      expect(pending.grantTask).not.toHaveBeenCalled();
    } finally { ui.unmount(); }
  });

  it.each(["always", "never", "task"] as const)("rejects a forged %s policy bypass", async (outcome) => {
    const pending = restrictedRequest();
    await expect(decide(pending, outcome)).rejects.toThrow("requires a one-time decision");
    expect(pending.resolve).not.toHaveBeenCalled();
    expect(pending.grantTask).not.toHaveBeenCalled();
    expect(grantAlways).not.toHaveBeenCalled();
    expect(grantNever).not.toHaveBeenCalled();
  });
});
