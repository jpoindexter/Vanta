import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { CompactionMeter, LiveRegion } from "./app-regions.js";
import type { PendingTool } from "./types.js";

const read: PendingTool = { name: "read_file", verb: "read", detail: "x.ts" };
const ran: PendingTool = { name: "shell_cmd", verb: "ran", detail: "build" };

describe("LiveRegion tool loaders (VANTA-TOOL-LOADER)", () => {
  it("shows a per-tool loader row (tool name + animated frame) while a tool runs", async () => {
    const inst = renderUi(h(LiveRegion, { streaming: "", activeTools: [read], busy: true, tick: 0 }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Read(x.ts)"); // tool-specific label
    expect(out).toMatch(/[✶✸✻]/); // an animated asterisk frame
    inst.unmount();
  });

  it("renders a separate loader row for each parallel in-flight tool", async () => {
    const inst = renderUi(h(LiveRegion, { streaming: "", activeTools: [read, ran], busy: true, tick: 2 }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Read(x.ts)");
    expect(out).toContain("Ran(build)");
    inst.unmount();
  });

  it("falls back to the global thinking spinner when no tool is running", async () => {
    const inst = renderUi(h(LiveRegion, { streaming: "", activeTools: [], busy: true, tick: 0 }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("esc to interrupt"); // global spinner row
    expect(out).not.toContain("(x.ts)"); // no per-tool loader
    inst.unmount();
  });

  it("renders nothing when idle and not streaming", async () => {
    const inst = renderUi(h(LiveRegion, { streaming: "", activeTools: [], busy: false, tick: 0 }));
    await tick();
    expect(inst.lastFrame().trim()).toBe("");
    inst.unmount();
  });
});

describe("CompactionMeter", () => {
  it("renders a labeled square-cell meter with a numeric percentage", async () => {
    const inst = renderUi(h(CompactionMeter, { progress: 25 }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Compacting conversation…");
    expect(out).toContain("■■■■■■□□□□□□□□□□□□□□□□□□ 25%");
    expect(out).not.toContain("░");
    inst.unmount();
  });

  it("replaces the generic spinner while compaction is active", async () => {
    const inst = renderUi(h(LiveRegion, {
      streaming: "",
      activeTools: [],
      busy: true,
      tick: 0,
      compacting: true,
      compactionProgress: 85,
    }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("85%");
    expect(out).not.toContain("esc to interrupt");
    inst.unmount();
  });

  it("renders manual compaction even when no agent turn is busy", async () => {
    const inst = renderUi(h(LiveRegion, {
      streaming: "",
      activeTools: [],
      busy: false,
      tick: 0,
      compacting: true,
      compactionProgress: 0,
    }));
    await tick();
    expect(inst.lastFrame()).toContain("□□□□□□□□□□□□□□□□□□□□□□□□ 0%");
    inst.unmount();
  });
});
