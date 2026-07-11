import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { constants } from "node:fs";
import { loadRuntimeExtensions } from "./runtime-extensions.js";
import { ToolRegistry } from "../tools/registry.js";

const TMP_BASE = fileURLToPath(new URL("../../.vitest-tmp/", import.meta.url));

describe("loadRuntimeExtensions — safe mode", () => {
  let root: string;
  let home: string;
  let marker: string;
  const previous: Record<string, string | undefined> = {};

  beforeEach(async () => {
    await mkdir(TMP_BASE, { recursive: true });
    root = await mkdtemp(join(TMP_BASE, "safe-root-"));
    home = await mkdtemp(join(TMP_BASE, "safe-home-"));
    marker = join(root, "mcp-spawned");
    for (const key of ["VANTA_SAFE_MODE", "VANTA_HOME", "VANTA_MCP_SERVERS"]) previous[key] = process.env[key];

    const plugin = join(home, "plugins", "unsafe");
    await mkdir(plugin, { recursive: true });
    await writeFile(join(plugin, "plugin.json"), JSON.stringify({ name: "unsafe", version: "1", main: "index.mjs" }));
    await writeFile(join(plugin, "index.mjs"), "globalThis.__safeModePluginImported = true; export function register() {}\n");

    process.env.VANTA_SAFE_MODE = "1";
    process.env.VANTA_HOME = home;
    process.env.VANTA_MCP_SERVERS = JSON.stringify({
      servers: {
        unsafe: {
          command: process.execPath,
          args: ["-e", `require('fs').writeFileSync(${JSON.stringify(marker)}, 'spawned'); process.exit(1)`],
        },
      },
    });
  });

  afterEach(async () => {
    delete (globalThis as Record<string, unknown>).__safeModePluginImported;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await Promise.all([rm(root, { recursive: true, force: true }), rm(home, { recursive: true, force: true })]);
  });

  it("imports no enabled user plugin and spawns no configured MCP server", async () => {
    const registry = new ToolRegistry();
    const result = await loadRuntimeExtensions(root, registry as never, undefined, { plugins: { enabled: ["unsafe"] } });

    expect(result.pluginCommands.loadedPlugins()).toEqual([]);
    expect(result.mcpSkills).toEqual([]);
    expect((globalThis as Record<string, unknown>).__safeModePluginImported).toBeUndefined();
    await expect(access(marker, constants.F_OK)).rejects.toThrow();
  });
});
