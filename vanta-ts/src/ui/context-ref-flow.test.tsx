import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "./composer.js";
import { renderUi, tick, waitForFrame, waitUntil } from "./test-render.js";
import { useSubmit } from "./use-submit.js";
import type { KernelClient } from "../kernel/client.js";

describe("context reference composer flow", () => {
  it("types, submits, expands, and receipts an @file range through the rendered composer", async () => {
    const send = vi.fn(), dispatch = vi.fn();
    const route = useSubmit({
      runSlash: vi.fn(), send, openOverlay: vi.fn(), busy: false,
      safety: {} as KernelClient, repoRoot: process.cwd(), dispatch,
    });
    const ui = renderUi(h(Composer, {
      focused: true, onSubmit: route, placeholder: "Ask", files: ["package.json"], history: [],
    }));
    await tick();
    ui.input("review @file:package.json:1-1");
    await waitForFrame(ui, "package.json:1-1");
    ui.input("\r");
    await waitUntil(() => send.mock.calls.length > 0);
    expect(send.mock.calls[0]![0]).toContain('<file path="package.json" lines="1-1">');
    expect(dispatch).toHaveBeenCalledWith({ t: "note", text: "  context expanded: @file:package.json:1-1" });
    ui.unmount();
  });
});
