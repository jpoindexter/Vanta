import { createElement as h } from "react";
import { describe, expect, it } from "vitest";
import { HooksPanel } from "./hooks-panel.js";
import { renderUi, tick, waitForFrame, waitUntil } from "./test-render.js";
import type { HooksPanelAction } from "./hooks-actions.js";

describe("HooksPanel", () => {
  it("opens an existing hook in view mode and deletes it with d", async () => {
    const actions: HooksPanelAction[] = [];
    const inst = renderUi(h(HooksPanel, {
      config: { PreToolUse: [{ command: "echo pre" }] },
      onAction: (a: HooksPanelAction) => actions.push(a),
      onClose: () => {},
    }));
    await waitForFrame(inst, "PreToolUse #1");
    inst.input("\r");
    await waitForFrame(inst, "echo pre");
    inst.input("d");
    await waitUntil(() => actions.length === 1);
    expect(actions[0]).toEqual({ kind: "remove", event: "PreToolUse", index: 0 });
    inst.unmount();
  });

  it("walks event -> type -> matcher -> action and emits an add action", async () => {
    const actions: HooksPanelAction[] = [];
    const inst = renderUi(h(HooksPanel, {
      config: {},
      onAction: (a: HooksPanelAction) => actions.push(a),
      onClose: () => {},
    }));
    await waitForFrame(inst, "New hook");
    inst.input("\r"); // choose New hook
    await waitForFrame(inst, "Event");
    inst.input("\r"); // SessionStart
    await waitForFrame(inst, "Type for SessionStart");
    inst.input("\r"); // command
    await waitForFrame(inst, "Matcher for SessionStart");
    inst.input("\r"); // all
    await waitForFrame(inst, "Action for SessionStart");
    inst.input("\r"); // printf template
    await waitUntil(() => actions.length === 1);
    expect(actions[0]).toMatchObject({
      kind: "add",
      event: "SessionStart",
      hook: { type: "command", command: "printf 'vanta hook fired\\n'" },
    });
    inst.unmount();
  });

  it("supports arrow-key selection in the wizard", async () => {
    const actions: HooksPanelAction[] = [];
    const inst = renderUi(h(HooksPanel, {
      config: {},
      onAction: (a: HooksPanelAction) => actions.push(a),
      onClose: () => {},
    }));
    await tick();
    inst.input("\r"); // New hook
    await waitForFrame(inst, "Event");
    inst.input("\x1B[B"); // Setup
    await tick();
    inst.input("\r");
    await waitForFrame(inst, "Type for Setup");
    inst.input("\x1B[B"); // http
    await tick();
    inst.input("\r");
    await waitForFrame(inst, "Matcher for Setup");
    inst.input("\x1B[B"); // tool
    await tick();
    inst.input("\r");
    await waitForFrame(inst, "Action for Setup");
    inst.input("\r");
    await waitUntil(() => actions.length === 1);
    expect(actions[0]).toMatchObject({
      kind: "add",
      event: "Setup",
      hook: { type: "http", url: "http://127.0.0.1:8787/hook", toolNamePattern: "shell_cmd|write_file" },
    });
    inst.unmount();
  });
});
