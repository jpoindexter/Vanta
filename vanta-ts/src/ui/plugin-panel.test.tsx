import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderUi } from "./test-render.js";
import { PluginPanel } from "./plugin-panel.js";

describe("PluginPanel", () => {
  it("renders a worker contribution with provenance", () => {
    const view = renderUi(h(PluginPanel, {
      panel: { plugin: "operator", key: "operator:status", id: "status", title: "Worker status", lines: ["job heartbeat ran"] },
      onClose: () => {},
    }));
    expect(view.lastFrame()).toContain("Worker status");
    expect(view.lastFrame()).toContain("operator worker");
    expect(view.lastFrame()).toContain("job heartbeat ran");
  });

  it("routes declared actions back through the normal Vanta submit path", () => {
    const onAction = vi.fn();
    const view = renderUi(h(PluginPanel, {
      panel: {
        plugin: "operator", key: "operator:status", id: "status", title: "Worker status", lines: [],
        actions: [{ id: "refresh", label: "Refresh now", prompt: "Refresh status" }],
      },
      onAction, onClose: () => {},
    }));
    view.input("1");
    expect(onAction).toHaveBeenCalledWith("Refresh status");
    view.input("d");
    expect(onAction).toHaveBeenCalledWith("Disable plugin operator with vanta plugin disable operator");
  });
});
