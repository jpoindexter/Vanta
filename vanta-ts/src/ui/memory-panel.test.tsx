import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { renderUi, tick, waitForFrame } from "./test-render.js";
import { MemoryPanel } from "./memory-panel.js";
import type { MemoryOverlayData } from "./memory-actions.js";

const data: MemoryOverlayData = {
  rows: [
    { id: "session:scratchpad", label: "Session scratchpad", source: "session", path: "/repo/.vanta/session-memory.md", detail: "1 KB", exists: true },
    { id: "brain:semantic", label: "Semantic Memory", source: "brain", path: "/home/brain/semantic.md", detail: "2 KB", exists: true },
  ],
};

describe("MemoryPanel", () => {
  it("renders memory files and the selected path", async () => {
    const inst = renderUi(h(MemoryPanel, { repoRoot: "/repo", data, onClose: () => {} }));
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("Memory files");
    expect(frame).toContain("Session scratchpad");
    expect(frame).toContain("/repo/.vanta/session-memory.md");
    inst.unmount();
  });

  it("moves selection with arrow keys", async () => {
    const inst = renderUi(h(MemoryPanel, { repoRoot: "/repo", data, onClose: () => {} }));
    inst.input("\x1b[B");
    expect(await waitForFrame(inst, "/home/brain/semantic.md")).toContain("Semantic Memory");
    inst.unmount();
  });
});
