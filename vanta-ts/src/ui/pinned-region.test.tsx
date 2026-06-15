import { createElement as h } from "react";
import { Text } from "ink";
import { describe, it, expect } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { pinSpacerHeight, PinnedRegion } from "./pinned-region.js";

describe("pinSpacerHeight", () => {
  it("reserves the gap below committed content", () => {
    expect(pinSpacerHeight(40, 11)).toBe(29); // tall terminal, banner only
    expect(pinSpacerHeight(24, 24)).toBe(0);   // content exactly fills viewport
  });
  it("clamps to 0 once committed content reaches/exceeds the viewport (natural flow)", () => {
    expect(pinSpacerHeight(20, 30)).toBe(0);
    expect(pinSpacerHeight(0, 0)).toBe(0);
  });
});

describe("PinnedRegion", () => {
  it("pushes children to the bottom when enabled: spacer fills the gap above", async () => {
    const inst = renderUi(h(PinnedRegion, { enabled: true, viewportRows: 10, committedRows: 0, children: h(Text, null, "BOTTOM") }));
    await tick();
    const lines = inst.lastFrame().split("\n");
    // The content sits on the last rendered line; everything above it is blank spacer.
    const idx = lines.findIndex((l) => l.includes("BOTTOM"));
    expect(idx).toBeGreaterThan(0); // not at the top — pushed down by the spacer
    expect(lines.slice(0, idx).every((l) => l.trim() === "")).toBe(true);
    inst.unmount();
  });

  it("renders flat (no spacer) when disabled — float behavior", async () => {
    const inst = renderUi(h(PinnedRegion, { enabled: false, viewportRows: 10, committedRows: 0, children: h(Text, null, "TOP") }));
    await tick();
    const lines = inst.lastFrame().split("\n").filter((l) => l.length > 0);
    // No spacer: content is on the first rendered line, nothing pushed down.
    expect(lines[0]).toContain("TOP");
    inst.unmount();
  });
});
