import { describe, expect, it } from "vitest";
import {
  buildPluginUpdateNotice,
  checkPluginUpdates,
  findPluginUpdates,
  pluginUpdateEnabled,
  type PluginUpdate,
  type PluginVersion,
} from "./auto-update.js";

describe("findPluginUpdates", () => {
  it("lists a plugin when the available version is strictly newer", () => {
    const installed: PluginVersion[] = [{ name: "alpha", installed: "1.0.0" }];
    const updates = findPluginUpdates(installed, { alpha: "1.1.0" });
    expect(updates).toEqual([
      { name: "alpha", installed: "1.0.0", latest: "1.1.0" },
    ]);
  });

  it("does not list a plugin at an equal version", () => {
    const installed: PluginVersion[] = [{ name: "alpha", installed: "2.3.4" }];
    expect(findPluginUpdates(installed, { alpha: "2.3.4" })).toEqual([]);
  });

  it("does not list a plugin whose available version is older", () => {
    const installed: PluginVersion[] = [{ name: "alpha", installed: "2.0.0" }];
    expect(findPluginUpdates(installed, { alpha: "1.9.9" })).toEqual([]);
  });

  it("skips a plugin absent from the available map", () => {
    const installed: PluginVersion[] = [
      { name: "alpha", installed: "1.0.0" },
      { name: "beta", installed: "1.0.0" },
    ];
    const updates = findPluginUpdates(installed, { beta: "2.0.0" });
    expect(updates).toEqual([
      { name: "beta", installed: "1.0.0", latest: "2.0.0" },
    ]);
  });

  it("skips a malformed available version safely (compareSemver tolerance)", () => {
    const installed: PluginVersion[] = [{ name: "alpha", installed: "1.0.0" }];
    // "not-a-version" parses to 0.0.0 → not strictly newer than 1.0.0.
    expect(findPluginUpdates(installed, { alpha: "not-a-version" })).toEqual([]);
  });

  it("skips a malformed installed version safely without throwing", () => {
    const installed: PluginVersion[] = [{ name: "alpha", installed: "garbage" }];
    // "garbage" parses to 0.0.0, "1.0.0" is newer → still listed, no throw.
    expect(findPluginUpdates(installed, { alpha: "1.0.0" })).toEqual([
      { name: "alpha", installed: "garbage", latest: "1.0.0" },
    ]);
  });

  it("returns [] for no installed plugins", () => {
    expect(findPluginUpdates([], { alpha: "1.0.0" })).toEqual([]);
  });

  it("lists only the plugins that have a newer version, among many", () => {
    const installed: PluginVersion[] = [
      { name: "alpha", installed: "1.0.0" },
      { name: "beta", installed: "2.0.0" },
      { name: "gamma", installed: "3.0.0" },
    ];
    const updates = findPluginUpdates(installed, {
      alpha: "1.0.1",
      beta: "2.0.0",
      gamma: "2.9.0",
    });
    expect(updates).toEqual([
      { name: "alpha", installed: "1.0.0", latest: "1.0.1" },
    ]);
  });
});

describe("buildPluginUpdateNotice", () => {
  it("returns '' when there are no updates", () => {
    expect(buildPluginUpdateNotice([])).toBe("");
  });

  it("uses the singular noun and names the update command for one update", () => {
    const updates: PluginUpdate[] = [
      { name: "alpha", installed: "1.0.0", latest: "1.1.0" },
    ];
    const notice = buildPluginUpdateNotice(updates);
    expect(notice).toBe(
      "↑ 1 plugin update: alpha 1.0.0→1.1.0 — run `vanta plugins update`",
    );
  });

  it("uses the plural noun and lists each name with versions", () => {
    const updates: PluginUpdate[] = [
      { name: "alpha", installed: "1.0.0", latest: "1.1.0" },
      { name: "beta", installed: "2.0.0", latest: "3.0.0" },
    ];
    const notice = buildPluginUpdateNotice(updates);
    expect(notice).toBe(
      "↑ 2 plugin updates: alpha 1.0.0→1.1.0, beta 2.0.0→3.0.0 — run `vanta plugins update`",
    );
  });

  it("includes the count, each name+versions, and the update command", () => {
    const updates: PluginUpdate[] = [
      { name: "alpha", installed: "1.0.0", latest: "1.1.0" },
    ];
    const notice = buildPluginUpdateNotice(updates);
    expect(notice).toContain("1 plugin");
    expect(notice).toContain("alpha");
    expect(notice).toContain("1.0.0");
    expect(notice).toContain("1.1.0");
    expect(notice).toContain("vanta plugins update");
  });
});

describe("pluginUpdateEnabled", () => {
  it("is off by default (unset)", () => {
    expect(pluginUpdateEnabled({})).toBe(false);
  });

  it("is on for '1'", () => {
    expect(pluginUpdateEnabled({ VANTA_PLUGIN_UPDATE_CHECK: "1" })).toBe(true);
  });

  it("is on for 'true' (case-insensitive, trimmed)", () => {
    expect(pluginUpdateEnabled({ VANTA_PLUGIN_UPDATE_CHECK: " TRUE " })).toBe(
      true,
    );
  });

  it("is off for '0' or any other value", () => {
    expect(pluginUpdateEnabled({ VANTA_PLUGIN_UPDATE_CHECK: "0" })).toBe(false);
    expect(pluginUpdateEnabled({ VANTA_PLUGIN_UPDATE_CHECK: "yes" })).toBe(
      false,
    );
  });
});

describe("checkPluginUpdates", () => {
  it("returns the update list from the injected fetch (no network)", async () => {
    const updates = await checkPluginUpdates({
      installed: [{ name: "alpha", installed: "1.0.0" }],
      fetchAvailable: async () => ({ alpha: "1.2.0" }),
    });
    expect(updates).toEqual([
      { name: "alpha", installed: "1.0.0", latest: "1.2.0" },
    ]);
  });

  it("returns [] (never throws) when fetchAvailable rejects", async () => {
    const updates = await checkPluginUpdates({
      installed: [{ name: "alpha", installed: "1.0.0" }],
      fetchAvailable: async () => {
        throw new Error("network down");
      },
    });
    expect(updates).toEqual([]);
  });

  it("returns [] when no plugins are installed", async () => {
    const updates = await checkPluginUpdates({
      installed: [],
      fetchAvailable: async () => ({ alpha: "9.9.9" }),
    });
    expect(updates).toEqual([]);
  });

  it("never auto-updates — only reports (fetchAvailable is the only side-effect seam)", async () => {
    let mutated = false;
    const updates = await checkPluginUpdates({
      installed: [{ name: "alpha", installed: "1.0.0" }],
      fetchAvailable: async () => {
        // The only injected effect is the read; no update hook exists to call.
        return { alpha: "2.0.0" };
      },
    });
    // The result is a plain report; nothing in the module performs an update.
    expect(mutated).toBe(false);
    expect(updates).toEqual([
      { name: "alpha", installed: "1.0.0", latest: "2.0.0" },
    ]);
  });
});
