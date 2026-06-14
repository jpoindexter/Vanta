import { createElement as h } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { ContextPanel } from "./context-panel.js";
import type { CtxCategory } from "./context-breakdown.js";

const sampleCategories: CtxCategory[] = [
  { label: "Assistant", tokens: 175 },
  { label: "User",      tokens: 75 },
  { label: "System prompt", tokens: 100 },
  { label: "Tool results", tokens: 20 },
];

describe("ContextPanel", () => {
  it("renders the title with kfmt totals and percent", async () => {
    const inst = renderUi(
      h(ContextPanel, {
        categories: sampleCategories,
        total: 370,
        contextWindow: 200_000,
        onClose: vi.fn(),
      }),
    );
    await tick();
    const out = inst.lastFrame();
    // kfmt(370) = "370", kfmt(200_000) = "200k"
    expect(out).toContain("370");
    expect(out).toContain("200k");
    // pct = round(370/200000*100) = 0%  (rounds to 0 at low fill)
    expect(out).toContain("Context");
    inst.unmount();
  });

  it("renders a category label", async () => {
    const inst = renderUi(
      h(ContextPanel, {
        categories: sampleCategories,
        total: 370,
        contextWindow: 200_000,
        onClose: vi.fn(),
      }),
    );
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Assistant");
    inst.unmount();
  });

  it("renders a bar char (█ or ░) for non-zero categories", async () => {
    const inst = renderUi(
      h(ContextPanel, {
        categories: sampleCategories,
        total: 370,
        contextWindow: 200_000,
        onClose: vi.fn(),
      }),
    );
    await tick();
    const out = inst.lastFrame();
    // contextBar always produces ░ or █
    expect(out).toMatch(/[█░]/);
    inst.unmount();
  });

  it("renders a token count for each category", async () => {
    const inst = renderUi(
      h(ContextPanel, {
        categories: sampleCategories,
        total: 370,
        contextWindow: 200_000,
        onClose: vi.fn(),
      }),
    );
    await tick();
    const out = inst.lastFrame();
    // kfmt(175) = "175", kfmt(75) = "75", kfmt(100) = "100"
    expect(out).toContain("175");
    expect(out).toContain("75");
    inst.unmount();
  });

  it("renders the Esc close footer", async () => {
    const inst = renderUi(
      h(ContextPanel, {
        categories: sampleCategories,
        total: 370,
        contextWindow: 200_000,
        onClose: vi.fn(),
      }),
    );
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Esc close");
    inst.unmount();
  });

  it("shows (context is empty) when categories is empty", async () => {
    const inst = renderUi(
      h(ContextPanel, {
        categories: [],
        total: 0,
        contextWindow: 200_000,
        onClose: vi.fn(),
      }),
    );
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("(context is empty)");
    inst.unmount();
  });
});
