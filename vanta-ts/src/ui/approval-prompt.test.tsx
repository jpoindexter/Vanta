import { createElement as h } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderUi, tick, waitUntil } from "./test-render.js";
import { ApprovalPrompt, decide, approves } from "./approval-prompt.js";
import type { Pending } from "./use-agent.js";

const mkPending = (over: Partial<Pending> = {}): Pending => ({
  action: "write src/router.ts", reason: "may touch a path outside the approved root",
  resolve: vi.fn(), ...over,
});
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe("ApprovalPrompt — Claude-method numbered menu", () => {
  it("offers one go-ahead for the current safe task plus one-time and persistent choices", async () => {
    const inst = renderUi(h(ApprovalPrompt, { pending: mkPending({ toolName: "shell_cmd", action: "run shell command: git status --short", canContinueTask: true }), onDone: () => {} }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Bash permission request");
    expect(out).toContain("Command");
    expect(out).toContain("git status --short");
    expect(out).toContain("Do you want to proceed?");
    expect(out).toContain("❯ 1."); // cursor on the selected (first) row
    expect(out).toContain("Yes — go ahead with this task");
    expect(out).not.toContain("Yes, just once");
    expect(out).toContain("Yes, and don't ask again");
    expect(out).toContain("No, and tell Vanta what to do");
    expect(out).toContain("Never allow this tool");
    expect(out).toContain("(esc)");
    inst.unmount();
  });

  it("Enter activates the focused approval action", async () => {
    const pending = mkPending();
    const done = vi.fn();
    const inst = renderUi(h(ApprovalPrompt, { pending, focusedTarget: "approval-deny", onDone: done }));
    await tick();
    expect(inst.lastFrame()).toContain("❯ 3.");
    inst.input("\r");
    await waitUntil(() => vi.mocked(pending.resolve).mock.calls.length > 0);
    expect(pending.resolve).toHaveBeenCalledWith(false);
    expect(done).toHaveBeenCalled();
    inst.unmount();
  });

  it("Esc still denies the approval prompt", async () => {
    const pending = mkPending();
    const inst = renderUi(h(ApprovalPrompt, { pending, onDone: () => {} }));
    await tick();
    inst.input("\x1b");
    await wait(130);
    await tick();
    expect(pending.resolve).toHaveBeenCalledWith(false);
    inst.unmount();
  });

  it("removes persistent approval from a fresh transaction decision", async () => {
    const pending = mkPending({ fresh: true, toolName: "payment_transaction" });
    const inst = renderUi(h(ApprovalPrompt, { pending, onDone: () => {} }));
    await tick();
    expect(inst.lastFrame()).not.toContain("don't ask again");
    await decide(pending, "always");
    expect(pending.resolve).toHaveBeenCalledWith(false);
    inst.unmount();
  });
});

describe("approves — outcome → run-or-not (pure)", () => {
  it("allow and always run; deny does not", () => {
    expect(approves("task")).toBe(true);
    expect(approves("allow")).toBe(true);
    expect(approves("always")).toBe(true);
    expect(approves("deny")).toBe(false);
    expect(approves("never")).toBe(false);
  });
});

describe("decide — resolves the pending promise", () => {
  // "always" is covered by grant.test.ts (it persists a rule); here we exercise
  // only the disk-free paths so the suite never writes to the real ~/.vanta.
  it("allow resolves the promise true", async () => {
    const p = mkPending();
    await decide(p, "allow");
    expect(p.resolve).toHaveBeenCalledWith(true);
  });

  it("task grants the current scope before resolving", async () => {
    const order: string[] = [];
    const p = mkPending({
      canContinueTask: true,
      grantTask: () => order.push("grant"),
      resolve: () => { order.push("resolve"); },
    });
    await decide(p, "task");
    expect(order).toEqual(["grant", "resolve"]);
  });

  it("deny resolves the promise false", async () => {
    const p = mkPending();
    await decide(p, "deny");
    expect(p.resolve).toHaveBeenCalledWith(false);
  });
});
