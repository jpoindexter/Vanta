import { createElement as h } from "react";
import { describe, it, expect, vi } from "vitest";
import { Text } from "ink";
import { renderUi, tick, waitForFrame, waitUntil } from "../test-render.js";
import { Ratchet } from "./ratchet.js";

describe("Ratchet", () => {
  it("starts collapsed: shows the summary + closed chevron, hides the body", async () => {
    const inst = renderUi(h(Ratchet, { summary: "Details" }, h(Text, {}, "the hidden body")));
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("Details");
    expect(frame).toContain("▸"); // closed chevron
    expect(frame).not.toContain("the hidden body");
    inst.unmount();
  });

  it("starts open when defaultOpen is set", async () => {
    const inst = renderUi(h(Ratchet, { summary: "Details", defaultOpen: true }, h(Text, {}, "shown body")));
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("▾"); // open chevron
    expect(frame).toContain("shown body");
    inst.unmount();
  });

  it("reveals the body on Enter (progressive disclosure)", async () => {
    const onToggle = vi.fn();
    const inst = renderUi(h(Ratchet, { summary: "More", onToggle }, h(Text, {}, "revealed content")));
    await tick();
    expect(inst.lastFrame()).not.toContain("revealed content");
    inst.input("\r"); // Enter toggles open
    const frame = await waitForFrame(inst, "revealed content");
    expect(frame).toContain("▾");
    await waitUntil(() => onToggle.mock.calls.length > 0);
    expect(onToggle).toHaveBeenCalledWith(true);
    inst.unmount();
  });

  it("toggles on Space too", async () => {
    const inst = renderUi(h(Ratchet, { summary: "More" }, h(Text, {}, "space body")));
    await tick();
    inst.input(" "); // Space toggles open
    const frame = await waitForFrame(inst, "space body");
    expect(frame).toContain("space body");
    inst.unmount();
  });
});
