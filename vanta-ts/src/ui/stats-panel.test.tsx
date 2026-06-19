import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { StatsPanel } from "./stats-panel.js";
import type { UsageStats } from "./stats-data.js";

const makeStats = (overrides: Partial<UsageStats> = {}): UsageStats => ({
  sessions: 4,
  turns: 27,
  toolCalls: 10,
  topTools: [{ name: "read_file", count: 6 }, { name: "write_file", count: 4 }],
  tokens: 24000,
  costUsd: 0.42,
  ...overrides,
});

describe("StatsPanel — renders usage aggregates", () => {
  it("shows session / turn / tool-call totals", async () => {
    const inst = renderUi(h(StatsPanel, { stats: makeStats(), onClose: () => {} }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Usage stats");
    expect(out).toContain("Sessions   4");
    expect(out).toContain("Turns      27");
    expect(out).toContain("Tool calls 10");
    inst.unmount();
  });

  it("shows the token estimate and a formatted cost", async () => {
    const inst = renderUi(h(StatsPanel, { stats: makeStats(), onClose: () => {} }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("24k");
    expect(out).toContain("$0.42");
    inst.unmount();
  });

  it("shows ~? when cost is unpriced", async () => {
    const inst = renderUi(h(StatsPanel, { stats: makeStats({ costUsd: null }), onClose: () => {} }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("~?");
    inst.unmount();
  });

  it("lists top tools with their call counts", async () => {
    const inst = renderUi(h(StatsPanel, { stats: makeStats(), onClose: () => {} }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("read_file");
    expect(out).toContain("write_file");
    inst.unmount();
  });

  it("shows the empty-state for no tools", async () => {
    const inst = renderUi(h(StatsPanel, { stats: makeStats({ topTools: [], toolCalls: 0 }), onClose: () => {} }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("(none yet)");
    inst.unmount();
  });

  it("shows the Esc footer", async () => {
    const inst = renderUi(h(StatsPanel, { stats: makeStats(), onClose: () => {} }));
    await tick();
    expect(inst.lastFrame()).toContain("Esc close");
    inst.unmount();
  });
});
