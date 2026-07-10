import { describe, expect, it } from "vitest";
import { activeKeybindingContexts, keybindingContexts } from "./keybinding-contexts.js";

describe("keybinding contexts", () => {
  it("publishes the named context set users can target in keybindings.json", () => {
    expect(keybindingContexts()).toHaveLength(18);
    expect(keybindingContexts()).toContain("global");
    expect(keybindingContexts()).toContain("messageSelector");
    expect(keybindingContexts()).toContain("diffDialog");
    expect(keybindingContexts()).toContain("plugin");
  });

  it("builds a priority stack from currently open TUI surfaces", () => {
    expect(activeKeybindingContexts({
      pending: true,
      quickOpen: true,
      messageActions: true,
      overlayKind: "review",
      transcriptSelection: true,
    }).slice(0, 5)).toEqual(["confirmation", "diffDialog", "select", "messageSelector", "transcript"]);
  });

  it("always ends with common contexts and global fallback", () => {
    expect(activeKeybindingContexts({}).slice(-5)).toEqual(["chat", "footer", "tabs", "task", "global"]);
  });
});
