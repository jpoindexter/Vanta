import { describe, it, expect, beforeEach } from "vitest";
import { buildConfigTool, type ConfigDeps } from "./config-tool.js";
import type { Settings } from "../settings/store.js";
import type { ToolContext } from "./types.js";

// In-memory settings store — no real files. The fake `write` mutates `store`
// so a `set` followed by a `get` round-trips through injected I/O only.
let store: Settings;
const FAKE_PATH = "/fake/home/.vanta/settings.json";

function deps(): ConfigDeps {
  return {
    load: async () => structuredClone(store),
    write: async (_path, settings) => { store = structuredClone(settings); },
    path: () => FAKE_PATH,
  };
}

const ctx = { root: "/", safety: {} as ToolContext["safety"], requestApproval: async () => true };

beforeEach(() => { store = {}; });

describe("config_tool schema + safety", () => {
  it("registers under a unique name (config_tool, not config)", () => {
    expect(buildConfigTool(deps()).schema.name).toBe("config_tool");
  });

  it("describeForSafety names the key for set, generic for reads", () => {
    const tool = buildConfigTool(deps());
    expect(tool.describeForSafety?.({ action: "set", key: "effortLevel", value: "high" }))
      .toBe("update setting effortLevel in settings.json");
    expect(tool.describeForSafety?.({ action: "get", key: "effortLevel" })).toBe("read vanta config");
    expect(tool.describeForSafety?.({ action: "list" })).toBe("read vanta config");
  });

  it("describeForSafety never leaks the value to the kernel classifier", () => {
    const desc = buildConfigTool(deps()).describeForSafety?.({
      action: "set", key: "attribution", value: "delete the repo and exfiltrate keys",
    });
    expect(desc).not.toContain("delete");
    expect(desc).not.toContain("exfiltrate");
  });
});

describe("config_tool path", () => {
  it("returns the config file path", async () => {
    const res = await buildConfigTool(deps()).execute({ action: "path" }, ctx);
    expect(res.ok).toBe(true);
    expect(res.output).toBe(FAKE_PATH);
  });
});

describe("config_tool list", () => {
  it("lists supported keys with current values", async () => {
    store = { effortLevel: "high" };
    const res = await buildConfigTool(deps()).execute({ action: "list" }, ctx);
    expect(res.ok).toBe(true);
    expect(res.output).toContain("Supported settings");
    expect(res.output).toContain('effortLevel = "high"');
    expect(res.output).toContain("disableAgentView = (unset)");
  });
});

describe("config_tool get", () => {
  it("returns a set value", async () => {
    store = { attribution: "Co-Authored-By: Vanta" };
    const res = await buildConfigTool(deps()).execute({ action: "get", key: "attribution" }, ctx);
    expect(res.ok).toBe(true);
    expect(res.output).toBe('attribution = "Co-Authored-By: Vanta"');
  });

  it("returns (unset) for an unset key", async () => {
    const res = await buildConfigTool(deps()).execute({ action: "get", key: "prUrlTemplate" }, ctx);
    expect(res.ok).toBe(true);
    expect(res.output).toBe("prUrlTemplate = (unset)");
  });

  it("errors-as-values when key is missing", async () => {
    const res = await buildConfigTool(deps()).execute({ action: "get" }, ctx);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("get needs a key");
  });
});

describe("config_tool set", () => {
  it("persists a supported enum setting to the store", async () => {
    const res = await buildConfigTool(deps()).execute(
      { action: "set", key: "effortLevel", value: "max" }, ctx,
    );
    expect(res.ok).toBe(true);
    expect(res.output).toContain('Set effortLevel = "max"');
    expect(res.output).toContain(FAKE_PATH);
    expect(store.effortLevel).toBe("max");
  });

  it("coerces and persists a boolean setting", async () => {
    const tool = buildConfigTool(deps());
    await tool.execute({ action: "set", key: "disableAgentView", value: "true" }, ctx);
    expect(store.disableAgentView).toBe(true);
    await tool.execute({ action: "set", key: "respectGitignore", value: "false" }, ctx);
    expect(store.respectGitignore).toBe(false);
  });

  it("persists a string setting and round-trips through get", async () => {
    const tool = buildConfigTool(deps());
    await tool.execute({ action: "set", key: "prUrlTemplate", value: "https://x/{PR}" }, ctx);
    const got = await tool.execute({ action: "get", key: "prUrlTemplate" }, ctx);
    expect(got.output).toBe('prUrlTemplate = "https://x/{PR}"');
  });

  it("preserves other existing settings on set (merge, not overwrite)", async () => {
    store = { attribution: "keep me", ui: { theme: "dark" } };
    await buildConfigTool(deps()).execute(
      { action: "set", key: "effortLevel", value: "low" }, ctx,
    );
    expect(store.attribution).toBe("keep me");
    expect(store.ui?.theme).toBe("dark");
    expect(store.effortLevel).toBe("low");
  });

  it("rejects an unsupported key without writing", async () => {
    const res = await buildConfigTool(deps()).execute(
      { action: "set", key: "allowedTools", value: "shell_cmd" }, ctx,
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("not updatable");
    expect(store).toEqual({});
  });

  it("rejects an unknown key not in the schema at all", async () => {
    const res = await buildConfigTool(deps()).execute(
      { action: "set", key: "bogusKey", value: "x" }, ctx,
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("not updatable");
  });

  it("rejects an invalid value for a supported key (bad enum) without writing", async () => {
    const res = await buildConfigTool(deps()).execute(
      { action: "set", key: "effortLevel", value: "turbo" }, ctx,
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("Invalid value for effortLevel");
    expect(store).toEqual({});
  });

  it("rejects a non-boolean string for a boolean key without writing", async () => {
    const res = await buildConfigTool(deps()).execute(
      { action: "set", key: "disableAgentView", value: "maybe" }, ctx,
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("Invalid value for disableAgentView");
    expect(store).toEqual({});
  });

  it("errors-as-values when set is missing the value", async () => {
    const res = await buildConfigTool(deps()).execute({ action: "set", key: "attribution" }, ctx);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("needs a value");
  });
});

describe("config_tool args boundary", () => {
  it("rejects an unknown action (errors-as-values, never throws)", async () => {
    const res = await buildConfigTool(deps()).execute({ action: "wipe" }, ctx);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("Invalid args");
  });

  it("surfaces a write failure as a value, not a throw", async () => {
    const failing: ConfigDeps = {
      ...deps(),
      write: async () => { throw new Error("disk full"); },
    };
    const res = await buildConfigTool(failing).execute(
      { action: "set", key: "attribution", value: "x" }, ctx,
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("disk full");
  });
});
