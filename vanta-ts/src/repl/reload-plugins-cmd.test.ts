import { describe, it, expect } from "vitest";
import { planPluginReload, formatReloadResult, runReloadPlugins } from "./reload-plugins-cmd.js";

describe("planPluginReload", () => {
  it("routes enabled-but-not-loaded plugins into toLoad", () => {
    const plan = planPluginReload(["a", "b", "c"], ["a"]);
    expect(plan.toLoad).toEqual(["b", "c"]);
    expect(plan.alreadyLoaded).toEqual(["a"]);
  });

  it("routes the intersection into alreadyLoaded", () => {
    const plan = planPluginReload(["a", "b"], ["a", "b"]);
    expect(plan.toLoad).toEqual([]);
    expect(plan.alreadyLoaded).toEqual(["a", "b"]);
  });

  it("returns empty toLoad when nothing is enabled", () => {
    const plan = planPluginReload([], ["a"]);
    expect(plan.toLoad).toEqual([]);
    expect(plan.alreadyLoaded).toEqual([]);
  });

  it("ignores loaded plugins that are no longer enabled", () => {
    const plan = planPluginReload(["a"], ["a", "x", "y"]);
    expect(plan.toLoad).toEqual([]);
    expect(plan.alreadyLoaded).toEqual(["a"]);
  });

  it("preserves enabled order in both buckets", () => {
    const plan = planPluginReload(["z", "m", "a"], ["m"]);
    expect(plan.toLoad).toEqual(["z", "a"]);
    expect(plan.alreadyLoaded).toEqual(["m"]);
  });

  it("dedupes repeated names in enabled and loaded", () => {
    const plan = planPluginReload(["a", "a", "b", "b"], ["b", "b"]);
    expect(plan.toLoad).toEqual(["a"]);
    expect(plan.alreadyLoaded).toEqual(["b"]);
  });

  it("drops empty-string names", () => {
    const plan = planPluginReload(["", "a"], [""]);
    expect(plan.toLoad).toEqual(["a"]);
    expect(plan.alreadyLoaded).toEqual([]);
  });

  it("is idempotent — a second plan with the new set loaded reports nothing new", () => {
    const first = planPluginReload(["a", "b"], ["a"]);
    expect(first.toLoad).toEqual(["b"]);
    const second = planPluginReload(["a", "b"], ["a", "b"]);
    expect(second.toLoad).toEqual([]);
    expect(second.alreadyLoaded).toEqual(["a", "b"]);
  });
});

describe("formatReloadResult", () => {
  it("summarizes newly-available plugins with names", () => {
    expect(formatReloadResult({ toLoad: ["b", "c"], alreadyLoaded: ["a"] }))
      .toBe("  ↻ 2 new plugin(s) available: b, c — loaded");
  });

  it("reports no new plugins with the already-loaded count", () => {
    expect(formatReloadResult({ toLoad: [], alreadyLoaded: ["a", "b"] }))
      .toBe("  no new plugins (2 already loaded)");
  });

  it("reports no new plugins with zero loaded", () => {
    expect(formatReloadResult({ toLoad: [], alreadyLoaded: [] }))
      .toBe("  no new plugins (0 already loaded)");
  });
});

describe("runReloadPlugins", () => {
  it("loads only the newly-available plugins and returns the summary", async () => {
    const loaded: string[][] = [];
    const result = await runReloadPlugins({
      readEnabled: () => ["a", "b", "c"],
      readLoaded: () => ["a"],
      loadPlugins: (names) => {
        loaded.push([...names]);
      },
    });
    expect(loaded).toEqual([["b", "c"]]);
    expect(result.output).toBe("  ↻ 2 new plugin(s) available: b, c — loaded");
  });

  it("does not call the loader when nothing is new", async () => {
    let called = false;
    const result = await runReloadPlugins({
      readEnabled: () => ["a"],
      readLoaded: () => ["a"],
      loadPlugins: () => {
        called = true;
      },
    });
    expect(called).toBe(false);
    expect(result.output).toBe("  no new plugins (1 already loaded)");
  });

  it("reports the plan even without a loader wired", async () => {
    const result = await runReloadPlugins({
      readEnabled: async () => ["a", "b"],
      readLoaded: async () => ["a"],
    });
    expect(result.output).toBe("  ↻ 1 new plugin(s) available: b — loaded");
  });

  it("awaits async readers", async () => {
    const result = await runReloadPlugins({
      readEnabled: async () => Promise.resolve(["x"]),
      readLoaded: async () => Promise.resolve([]),
    });
    expect(result.output).toBe("  ↻ 1 new plugin(s) available: x — loaded");
  });
});
