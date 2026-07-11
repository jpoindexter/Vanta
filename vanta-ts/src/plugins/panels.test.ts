import { describe, expect, it } from "vitest";
import { PluginPanelRegistry } from "./panels.js";
import type { DashboardPanelManifest } from "./manifest.js";

describe("PluginPanelRegistry", () => {
  it("sanitizes terminal controls from untrusted worker content", () => {
    const registry = new PluginPanelRegistry();
    const escape = String.fromCharCode(27);
    const panel = registry.register("operator", {
      id: "status",
      title: `${escape}[31mStatus${escape}[0m`,
      lines: [`safe${String.fromCharCode(7)}line`],
    });
    expect(panel.title).toBe("Status");
    expect(panel.lines).toEqual(["safe line"]);
    expect(JSON.stringify(panel)).not.toContain(escape);
  });

  it("publishes only declared metadata and enforces required capability grants", () => {
    const registry = new PluginPanelRegistry();
    const declaration: DashboardPanelManifest = {
      id: "status", title: "Worker status", provider: "loadStatus", refreshMs: 10_000,
      requiredCapabilities: ["ui.panel", "storage.read"],
      actions: [{ id: "refresh", label: "Refresh now", prompt: "Refresh status" }],
    };
    expect(() => registry.publish("operator", declaration, ["line"], ["ui.panel"])).toThrow(/storage.read/);
    const panel = registry.publish("operator", declaration, ["live"], ["ui.panel", "storage.read"]);
    expect(panel).toMatchObject({ title: "Worker status", provider: "loadStatus", refreshMs: 10_000 });
    expect(panel.actions).toEqual([{ id: "refresh", label: "Refresh now", prompt: "Refresh status" }]);
  });
});
