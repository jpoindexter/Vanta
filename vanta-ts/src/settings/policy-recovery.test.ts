import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeMetadataCache } from "../cache/metadata.js";
import { mountMcpServers } from "../mcp/mount.js";
import { ToolRegistry } from "../tools/registry.js";
import { installPluginSources } from "../cli/plugin-source-install.js";
import { reloadPlugins } from "../repl/reload-plugins-cmd.js";
import { runToolsSection } from "../setup-tools.js";
import { loadRuntimeSettings } from "../session/runtime-extensions.js";
import { reloadSettingsIfChanged } from "./hot-reload.js";
import { loadSettings, settingsCachePath } from "./store.js";

let fixture: string;
let home: string;
let root: string;
let scopes: string[];

beforeEach(async () => {
  fixture = await mkdtemp(join(tmpdir(), "vanta-policy-recovery-"));
  home = join(fixture, "home");
  root = join(fixture, "project");
  await mkdir(home);
  await mkdir(join(root, ".vanta"), { recursive: true });
  scopes = [join(home, "settings.json"), join(root, ".vanta/settings.json"), join(root, ".vanta/settings.local.json")];
  vi.stubEnv("VANTA_HOME", home);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(fixture, { recursive: true, force: true });
});

describe("settings policy recovery", () => {
  it.each([0, 1, 2])("rejects malformed JSON in scope %i without changing it", async (scope) => {
    const path = scopes[scope]!;
    const text = '{"blockedTools":["shell_cmd"],';
    await writeFile(path, text);
    await expect(loadSettings(root, process.env)).rejects.toThrow(path);
    expect(await readFile(path, "utf8")).toBe(text);
  });

  it.each(["null", "[]", '"text"', "42", '{"blockedTools":false}', '{"blockedTools":["shell_cmd"],"ui":{"noTui":"bad"}}'])
    ("rejects invalid source %s rather than discarding its policy", async (text) => {
      await writeFile(scopes[0]!, text);
      await expect(loadSettings(root, process.env)).rejects.toThrow(scopes[0]!);
      expect(await readFile(scopes[0]!, "utf8")).toBe(text);
    });

  it("preserves recognized policy when ignoring unknown keys", async () => {
    await writeFile(scopes[0]!, JSON.stringify({ blockedTools: ["shell_cmd"], futurePreference: true }));
    expect(await loadSettings(root, process.env)).toEqual({ blockedTools: ["shell_cmd"] });
  });

  it.each([1, 2])("does not reuse a v%i cache of silently discarded settings", async (version) => {
    await writeFile(scopes[0]!, '{"blockedTools":["shell_cmd"],');
    await writeMetadataCache(settingsCachePath(root, process.env), version, {}, scopes);
    await expect(loadSettings(root, process.env)).rejects.toThrow(scopes[0]!);
  });

  it("does not let a cache omit configured policy sources", async () => {
    await writeFile(scopes[0]!, '{"blockedTools":');
    await writeMetadataCache(settingsCachePath(root, process.env), 2, {}, []);
    await expect(loadSettings(root, process.env)).rejects.toThrow(scopes[0]!);
  });

  it("rejects an unreadable scope instead of treating it as missing", async () => {
    await mkdir(scopes[1]!);
    await expect(loadSettings(root, process.env)).rejects.toThrow(scopes[1]!);
  });

  it("stops runtime construction before applying env when policy needs recovery", async () => {
    await writeFile(scopes[0]!, JSON.stringify({ blockedTools: ["shell_cmd"], env: { VANTA_POLICY_RECOVERY_PROBE: "unsafe" }, effortLevel: "bad" }));
    vi.stubEnv("VANTA_POLICY_RECOVERY_PROBE", "");
    await expect(loadRuntimeSettings(root)).rejects.toThrow(scopes[0]!);
    expect(process.env.VANTA_POLICY_RECOVERY_PROBE).toBe("");
  });

  it("keeps the prior hot-reload state when the real settings loader rejects corruption", async () => {
    await writeFile(scopes[2]!, '{"blockedTools":');
    const applyEnv = vi.fn();
    expect(await reloadSettingsIfChanged({
      prevSig: "before", readSig: () => "changed", loadSettings: () => loadSettings(root, process.env), applyEnv,
    })).toEqual({ reloaded: false });
    expect(applyEnv).not.toHaveBeenCalled();
  });

  it("does not expose invalid source contents in its recovery error", async () => {
    await writeFile(scopes[0]!, '{"env":{"SECRET":"private-fixture-value"},');
    await expect(loadSettings(root, process.env)).rejects.not.toThrow("private-fixture-value");
  });

  it("stops MCP mounting before any trust or launch when policy is corrupt", async () => {
    await writeFile(scopes[0]!, '{"mcp":{"deny":');
    const confirm = vi.fn(async () => true);
    await expect(mountMcpServers(new ToolRegistry(), {
      VANTA_HOME: home,
      VANTA_MCP_SERVERS: JSON.stringify({ servers: { fixture: { command: "must-not-launch" } } }),
    }, undefined, { cwd: root, trust: { root, confirm } })).rejects.toThrow(scopes[0]!);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("stops plugin source installation before writing when policy is corrupt", async () => {
    await writeFile(scopes[0]!, '{"plugins":');
    const log = vi.fn();
    await expect(installPluginSources(root, [{ dir: fixture }], { env: process.env, log })).rejects.toThrow(scopes[0]!);
    await expect(readFile(join(home, "plugins"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(log).not.toHaveBeenCalled();
  });

  it("stops plugin reload and tool setup before enabling anything with corrupt policy", async () => {
    await writeFile(scopes[0]!, '{"blockedTools":');
    await expect(reloadPlugins("", { dataDir: join(root, ".vanta"), env: process.env } as never)).rejects.toThrow(scopes[0]!);
    await expect(runToolsSection(root)).rejects.toThrow(scopes[0]!);
  });
});
