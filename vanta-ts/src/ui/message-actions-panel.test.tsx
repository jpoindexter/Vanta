import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { MessageActionsPanel } from "./message-actions-panel.js";
import { renderUi, waitForFrame, waitUntil, tick } from "./test-render.js";

describe("MessageActionsPanel", () => {
  it("opens over previous messages and retries a selected user message", async () => {
    const retry = vi.fn();
    const close = vi.fn();
    const inst = renderUi(h(MessageActionsPanel, {
      entries: [{ kind: "assistant", text: "answer" }, { kind: "user", text: "try again" }],
      onRetry: retry,
      onBranch: vi.fn(),
      onClose: close,
    }));
    await waitForFrame(inst, "Message Actions");
    inst.input("\r");
    await waitForFrame(inst, "retry");
    inst.input("\x1b[B");
    await tick();
    inst.input("\r");
    await waitUntil(() => retry.mock.calls.length > 0);
    expect(retry).toHaveBeenCalledWith("try again");
    expect(close).toHaveBeenCalled();
    inst.unmount();
  });

  it("runs the branch action from the action menu", async () => {
    const branch = vi.fn();
    const inst = renderUi(h(MessageActionsPanel, {
      entries: [{ kind: "assistant", text: "answer" }],
      onRetry: vi.fn(),
      onBranch: branch,
      onClose: vi.fn(),
    }));
    await waitForFrame(inst, "answer");
    inst.input("\r");
    await waitForFrame(inst, "branch");
    inst.input("\x1b[B");
    await tick();
    inst.input("\x1b[B");
    await tick();
    inst.input("\r");
    await waitUntil(() => branch.mock.calls.length > 0);
    inst.unmount();
  });
});
