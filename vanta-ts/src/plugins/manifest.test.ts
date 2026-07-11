import { describe, expect, it } from "vitest";
import { parsePluginManifest, pluginToolPrefix } from "./manifest.js";

describe("plugin manifest", () => {
  it("accepts the minimal JSON manifest", () => {
    expect(parsePluginManifest({ name: "echo", version: "0.1.0" })).toMatchObject({
      name: "echo",
      version: "0.1.0",
      main: "index.js",
    });
  });

  it("rejects invalid names and unknown keys", () => {
    expect(() => parsePluginManifest({ name: "../x", version: "1.0.0" })).toThrow();
    expect(() => parsePluginManifest({ name: "echo", version: "1.0.0", postinstall: "npm i" })).toThrow();
  });

  it("accepts a versioned worker declaration with known capabilities", () => {
    const manifest = parsePluginManifest({
      name: "operator",
      version: "1.0.0",
      worker: { main: "worker.mjs", capabilities: ["log.write", "schedule.jobs", "ui.panel"] },
    });
    expect(manifest.worker).toEqual({ main: "worker.mjs", capabilities: ["log.write", "schedule.jobs", "ui.panel"] });
  });

  it("rejects unknown worker capabilities", () => {
    expect(() => parsePluginManifest({
      name: "operator",
      version: "1.0.0",
      worker: { main: "worker.mjs", capabilities: ["shell.unbounded"] },
    })).toThrow();
  });

  it("accepts bounded dashboard panel declarations and rejects unsafe refresh intervals", () => {
    const manifest = parsePluginManifest({
      name: "operator", version: "1.0.0",
      worker: { main: "worker.mjs", capabilities: ["ui.panel", "storage.read"] },
      dashboardPanels: [{
        id: "status", title: "Worker status", provider: "loadStatus", refreshMs: 10_000,
        requiredCapabilities: ["ui.panel", "storage.read"],
        actions: [{ id: "refresh", label: "Refresh now", prompt: "Refresh the operator status panel" }],
      }],
    });
    expect(manifest.dashboardPanels?.[0]?.provider).toBe("loadStatus");
    expect(() => parsePluginManifest({
      name: "operator", version: "1.0.0", worker: { main: "worker.mjs", capabilities: ["ui.panel"] },
      dashboardPanels: [{ id: "x", title: "X", provider: "x", refreshMs: 100, requiredCapabilities: ["ui.panel"] }],
    })).toThrow();
  });

  it("builds a namespaced tool prefix", () => {
    expect(pluginToolPrefix("my-plugin")).toBe("plugin_my_plugin_");
  });
});
