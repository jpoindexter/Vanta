import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { TraceEvidencePanel } from "./trace-evidence-panel.js";
import { renderUi, tick } from "./test-render.js";

describe("TraceEvidencePanel", () => {
  it("exposes complete stored tool output on demand", async () => {
    const inst = renderUi(h(TraceEvidencePanel, { entries: [{ kind: "toolGroup", tools: [{ kind: "tool", name: "grep_files", verb: "searched", detail: "src", ok: true, rawOutput: "match one\nmatch two" }] }] }));
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("Tool evidence");
    expect(frame).toContain("Ctrl+T closes");
    expect(frame).toContain("match one");
    expect(frame).toContain("match two");
    inst.unmount();
  });
});
