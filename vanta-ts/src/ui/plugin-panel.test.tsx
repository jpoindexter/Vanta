import { createElement as h } from "react";
import { describe, expect, it } from "vitest";
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
});
