import { describe, it, expect } from "vitest";
import { PLUGIN_CATALOG, pluginById, formatPluginList } from "./catalog.js";

describe("PLUGIN_CATALOG", () => {
  it("has at least the browser plugin", () => {
    expect(PLUGIN_CATALOG.some((p) => p.id === "browser")).toBe(true);
  });

  it("each plugin has id, label, depsLocation, stateLocation", () => {
    for (const p of PLUGIN_CATALOG) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.depsLocation).toBeTruthy();
      expect(p.stateLocation).toBeTruthy();
    }
  });
});

describe("pluginById", () => {
  it("finds browser by id", () => {
    expect(pluginById("browser")?.id).toBe("browser");
  });

  it("returns undefined for unknown id", () => {
    expect(pluginById("notreal")).toBeUndefined();
  });
});

describe("formatPluginList", () => {
  it("shows installed vs available", () => {
    const browser = pluginById("browser")!;
    const out = formatPluginList([
      { entry: browser, installed: true },
    ]);
    expect(out).toContain("[installed]");
    expect(out).toContain("browser");
    expect(out).toContain("deps:");
  });
});
