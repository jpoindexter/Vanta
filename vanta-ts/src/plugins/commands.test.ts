import { describe, expect, it } from "vitest";
import { PluginCommandRegistry } from "./commands.js";

describe("PluginCommandRegistry loaded state", () => {
  it("tracks a commandless plugin explicitly", () => {
    const registry = new PluginCommandRegistry();
    registry.markLoaded("worker-only");
    expect(registry.loadedPlugins()).toEqual(["worker-only"]);
  });

  it("tracks command-contributing plugins without duplicates", () => {
    const registry = new PluginCommandRegistry();
    registry.register("echo", "echo-one", () => ({}));
    registry.register("echo", "echo-two", () => ({}));
    expect(registry.loadedPlugins()).toEqual(["echo"]);
  });
});
