import { createElement as h, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { grantAlways, grantNever } from "../permissions/grant.js";
import { resolveApproval } from "../desktop/approval.js";
import { ApprovalPrompt, decide } from "./approval-prompt.js";
import { renderUi, waitForFrame, waitUntil } from "./test-render.js";
import type { Pending } from "./use-agent.js";

vi.mock("../permissions/grant.js", () => ({ grantAlways: vi.fn(), grantNever: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const pending = (extra: Partial<Pending> = {}): Pending => ({ action: "example", reason: "approval", toolName: "shell_cmd", resolve: vi.fn(), ...extra });

describe("Desktop and TUI approval parity", () => {
  it.each(["allow", "always", "deny", "never"] as const)("resolves %s equivalently", async (decision) => {
    const tui = pending();
    const desktop = { ...pending(), id: "one" };
    expect(await decide(tui, decision)).toEqual(await resolveApproval(desktop, decision));
    expect(tui.resolve).toHaveBeenCalledExactlyOnceWith(decision === "allow" || decision === "always");
    expect(desktop.resolve).toHaveBeenCalledExactlyOnceWith(decision === "allow" || decision === "always");
  });

  it.each(["always", "never"] as const)("TUI denies %s persistence errors rather than allowing once", async (decision) => {
    vi.mocked(decision === "always" ? grantAlways : grantNever).mockRejectedValueOnce(new Error("private path"));
    const p = pending();
    expect(await decide(p, decision)).toMatchObject({ approved: false, decision: "deny", error: "Could not save the approval rule. The action was not approved." });
    expect(p.resolve).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("both hosts deny persistent allow for fresh approval", async () => {
    const tui = pending({ fresh: true });
    const desktop = { ...pending(), id: "fresh", detail: { fresh: true } };
    expect(await decide(tui, "always")).toEqual(await resolveApproval(desktop, "always"));
    expect(tui.resolve).toHaveBeenCalledExactlyOnceWith(false);
    expect(desktop.resolve).toHaveBeenCalledExactlyOnceWith(false);
    expect(grantAlways).not.toHaveBeenCalled();
  });

  it.each([{ fresh: true, canContinueTask: true }, { canContinueTask: false }])("does not create a task grant outside the eligible scope", async (scope) => {
    const grantTask = vi.fn();
    const p = pending({ ...scope, grantTask });
    expect(await decide(p, "task")).toEqual({ approved: false, decision: "deny" });
    expect(grantTask).not.toHaveBeenCalled();
    expect(p.resolve).toHaveBeenCalledExactlyOnceWith(false);
  });

  it.each(["always", "never"] as const)("shows a %s save error and safely dismisses it without another decision", async (decision) => {
    vi.mocked(decision === "always" ? grantAlways : grantNever).mockRejectedValueOnce(new Error("private path"));
    const p = pending();
    const done = vi.fn();
    const inst = renderUi(h(ApprovalPrompt, { pending: p, onDone: done, focusedTarget: decision === "always" ? "approval-always" : "approval-never" }));
    try {
      await waitForFrame(inst, "Do you want to proceed?");
      inst.input("\r");
      await waitForFrame(inst, "Could not save the approval rule");
      expect(p.resolve).toHaveBeenCalledExactlyOnceWith(false);
      expect(done).not.toHaveBeenCalled();
      expect(inst.lastFrame()).not.toContain("private path");
      inst.input("\r");
      await waitUntil(() => done.mock.calls.length === 1);
      inst.input("\r");
      inst.input("\x1b");
      await new Promise((resolve) => setTimeout(resolve, 130));
      expect(done).toHaveBeenCalledTimes(1);
      expect(p.resolve).toHaveBeenCalledTimes(1);
    } finally { inst.unmount(); }
  });

  it.each([false, true])("does not dismiss a replacement prompt when an old save finishes (failure=%s)", async (fail) => {
    let finish!: () => void;
    vi.mocked(grantAlways).mockImplementationOnce(() => new Promise<void>((resolve, reject) => {
      finish = () => fail ? reject(new Error("old save failed")) : resolve();
    }));
    const first = pending({ action: "old pending action" });
    const second = pending({ action: "replacement pending action" });
    const done = vi.fn();
    let replace!: (next: Pending) => void;
    function Host() {
      const [active, setActive] = useState(first);
      replace = setActive;
      return h(ApprovalPrompt, { pending: active, onDone: done, focusedTarget: "approval-always" });
    }
    const inst = renderUi(h(Host));
    try {
      await waitForFrame(inst, "old pending action");
      inst.input("\r");
      await waitUntil(() => vi.mocked(grantAlways).mock.calls.length === 1);
      replace(second);
      await waitForFrame(inst, "replacement pending action");
      finish();
      await waitUntil(() => vi.mocked(first.resolve).mock.calls.length === 1);
      expect(done).not.toHaveBeenCalled();
      expect(inst.lastFrame()).not.toContain("Could not save the approval rule");
      inst.input("1");
      await waitUntil(() => vi.mocked(second.resolve).mock.calls.length === 1);
      expect(first.resolve).toHaveBeenCalledExactlyOnceWith(!fail);
      expect(second.resolve).toHaveBeenCalledExactlyOnceWith(true);
      expect(done).toHaveBeenCalledTimes(1);
    } finally { inst.unmount(); }
  });

  it("accepts a subsequent pending approval without reusing the previous claim", async () => {
    const first = pending({ action: "first action" });
    const second = pending({ action: "second action" });
    function Host() {
      const [active, setActive] = useState(first);
      return h(ApprovalPrompt, { pending: active, onDone: () => setActive(second), focusedTarget: "approval-allow" });
    }
    const inst = renderUi(h(Host));
    try {
      await waitForFrame(inst, "first action");
      inst.input("\r");
      await waitForFrame(inst, "second action");
      inst.input("\r");
      await waitUntil(() => vi.mocked(second.resolve).mock.calls.length === 1);
      expect(first.resolve).toHaveBeenCalledExactlyOnceWith(true);
      expect(second.resolve).toHaveBeenCalledExactlyOnceWith(true);
    } finally { inst.unmount(); }
  });

  it("ignores repeated keys while saving a rule", async () => {
    let finish!: () => void;
    vi.mocked(grantAlways).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const p = pending();
    const done = vi.fn();
    const inst = renderUi(h(ApprovalPrompt, { pending: p, onDone: done, focusedTarget: "approval-always" }));
    try {
      await waitForFrame(inst, "Do you want to proceed?");
      inst.input("\r");
      await waitUntil(() => vi.mocked(grantAlways).mock.calls.length === 1);
      inst.input("\r");
      expect(p.resolve).not.toHaveBeenCalled();
      finish();
      await waitUntil(() => done.mock.calls.length === 1);
      expect(grantAlways).toHaveBeenCalledTimes(1);
      expect(p.resolve).toHaveBeenCalledExactlyOnceWith(true);
    } finally { inst.unmount(); }
  });
});
