import { Children, isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { ChatFirstOverlays } from "./chat-first-overlays.js";
import { restorePreparedRun } from "./chat-first-library.js";
import { SettingsDialog } from "./overlays.js";
import { withProjectAttachments } from "./use-composer-attachments.js";
import type { ChatFirstState } from "./chat-first-state.js";
import type { ChatFirstActions } from "./chat-first-actions.js";
import type { PreparedRun } from "./types.js";

describe("retained workbench context", () => {
  it("restores prepared file inputs without executing or duplicating references", async () => {
    const order: string[] = [];
    const files: string[] = [];
    let draft = "";
    const state = {
      convo: { openSession: async () => { order.push("open"); }, setDraft: (text: string) => { draft = text; } },
      attachments: { clear: () => { files.length = 0; }, addFile: (file: string) => { files.push(file); } },
      setView: (view: string) => { order.push(view); },
    } as unknown as ChatFirstState;
    const prepared = { sessionId: "fork", draft: "Read reference\n@guide.md", files: ["guide.md"] } as PreparedRun;
    await restorePreparedRun(state, prepared);
    expect(files).toEqual(["guide.md"]);
    expect(withProjectAttachments(draft, files)).toBe("Read reference\n@guide.md");
    expect(order).toEqual(["open", "work"]);
  });

  it("preserves the existing attachments if opening the prepared session fails", async () => {
    const clear = vi.fn(), addFile = vi.fn(), setDraft = vi.fn(), setView = vi.fn();
    const state = { convo: { openSession: async () => { throw new Error("Session unavailable"); }, setDraft },
      attachments: { clear, addFile }, setView } as unknown as ChatFirstState;
    await expect(restorePreparedRun(state, { sessionId: "missing" } as PreparedRun)).rejects.toThrow("Session unavailable");
    for (const action of [clear, addFile, setDraft, setView]) expect(action).not.toHaveBeenCalled();
  });

  it("deduplicates exact attachment lines without removing ordinary prompt text", () => {
    expect(withProjectAttachments("Discuss @guide.md inline\n@guide.md", ["guide.md", "guide.md", "notes.md"]))
      .toBe("Discuss @guide.md inline\n@guide.md\n@notes.md");
  });

  it("closes Settings before opening its model or provider dialog", () => {
    const calls: string[] = [];
    const state = {
      data: { closeSettings: () => calls.push("close"), openModelPicker: () => calls.push("model"), openSetup: () => calls.push("setup") },
      sound: {}, warning: {}, approval: {}, view: "work",
    } as unknown as ChatFirstState;
    const tree = ChatFirstOverlays({ state, actions: {} as ChatFirstActions });
    const settings = Children.toArray(tree.props.children).find((child) => isValidElement(child) && child.type === SettingsDialog) as ReactElement<{ onModel: () => void; onSetup: () => void }>;
    settings.props.onModel(); settings.props.onSetup();
    expect(calls).toEqual(["close", "model", "close", "setup"]);
  });
});
