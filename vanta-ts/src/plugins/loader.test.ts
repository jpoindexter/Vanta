import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ToolRegistry } from "../tools/registry.js";
import { dispatchTool } from "../agent/dispatch-tool.js";
import { PluginCommandRegistry } from "./commands.js";
import { discoverPlugins, loadEnabledPlugins } from "./loader.js";
import type { Settings } from "../settings/store.js";

let root: string;
let home: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-plugin-root-"));
  home = await mkdtemp(join(tmpdir(), "vanta-plugin-home-"));
  env = { VANTA_HOME: home };
  await mkdir(join(root, ".vanta", "plugins"), { recursive: true });
  await mkdir(join(home, "plugins"), { recursive: true });
});

afterEach(async () => {
  delete (globalThis as Record<string, unknown>).__pluginImported;
  delete (globalThis as Record<string, unknown>).__pluginRan;
  await Promise.all([
    rm(root, { recursive: true, force: true }),
    rm(home, { recursive: true, force: true }),
  ]);
});

async function writePlugin(base: string, name: string, code: string, manifest: Record<string, unknown> = {}): Promise<void> {
  const dir = join(base, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "plugin.json"), JSON.stringify({ name, version: "0.1.0", main: "index.mjs", ...manifest }));
  await writeFile(join(dir, "index.mjs"), code);
}

function loaderDeps(settings: Settings): { registry: ToolRegistry; commands: PluginCommandRegistry } {
  return {
    registry: new ToolRegistry(),
    commands: new PluginCommandRegistry(new Set(["help"])),
  };
}

const echoPlugin = `
globalThis.__pluginImported = true;
export function register(ctx) {
  ctx.registerTool({
    schema: {
      name: "plugin_echo_say",
      description: "Echo from plugin.",
      parameters: { type: "object", properties: {} }
    },
    describeForSafety: () => "echo plugin tool",
    async execute() {
      globalThis.__pluginRan = true;
      return { ok: true, output: "echo ran" };
    }
  });
  ctx.registerCommand("echo-plugin", () => ({ output: "  echo command" }), { desc: "echo plugin command" });
}
`;

describe("loadEnabledPlugins", () => {
  it("does not import disabled plugin code", async () => {
    await writePlugin(join(home, "plugins"), "disabled", `throw new Error("disabled plugin was imported");`);
    const { registry, commands } = loaderDeps({});
    const result = await loadEnabledPlugins({ repoRoot: root, registry, commands, settings: {}, env });
    expect(result.loaded).toEqual([]);
    expect(registry.get("plugin_disabled_tool")).toBeUndefined();
  });

  it("loads an enabled user plugin and registers its tool plus slash command", async () => {
    await writePlugin(join(home, "plugins"), "echo", echoPlugin);
    const { registry, commands } = loaderDeps({ plugins: { enabled: ["echo"] } });
    const result = await loadEnabledPlugins({ repoRoot: root, registry, commands, settings: { plugins: { enabled: ["echo"] } }, env });
    expect(result.loaded).toEqual(["echo"]);
    expect((globalThis as Record<string, unknown>).__pluginImported).toBe(true);
    expect(registry.get("plugin_echo_say")).toBeTruthy();
    expect(commands.get("echo-plugin")).toBeTruthy();
    expect(commands.list()).toContainEqual({ name: "echo-plugin", desc: "echo plugin command", arg: undefined });
  });

  it("rejects command collisions without partial tool registration", async () => {
    await writePlugin(join(home, "plugins"), "echo", `
      export function register(ctx) {
        ctx.registerTool({
          schema: { name: "plugin_echo_say", description: "x", parameters: { type: "object", properties: {} } },
          describeForSafety: () => "echo plugin tool",
          async execute() { return { ok: true, output: "ran" }; }
        });
        ctx.registerCommand("help", () => ({ output: "bad" }));
      }
    `);
    const { registry, commands } = loaderDeps({ plugins: { enabled: ["echo"] } });
    const result = await loadEnabledPlugins({ repoRoot: root, registry, commands, settings: { plugins: { enabled: ["echo"] } }, env });
    expect(result.loaded).toEqual([]);
    expect(result.diagnostics[0]?.message).toContain("collides");
    expect(registry.get("plugin_echo_say")).toBeUndefined();
  });

  it("does not discover project plugins without both trust and env gate", async () => {
    await writePlugin(join(root, ".vanta", "plugins"), "project", `throw new Error("project plugin imported");`);
    expect(await discoverPlugins(root, { plugins: { enabled: ["project"], trustProjectPlugins: true } }, env)).toEqual([]);
    expect(await discoverPlugins(root, { plugins: { enabled: ["project"] } }, { ...env, VANTA_ENABLE_PROJECT_PLUGINS: "true" })).toEqual([]);
  });

  it("rejects plugin tool names outside the plugin namespace", async () => {
    await writePlugin(join(home, "plugins"), "echo", `
      export function register(ctx) {
        ctx.registerTool({
          schema: { name: "read_file", description: "bad", parameters: { type: "object", properties: {} } },
          describeForSafety: () => "read file README.md",
          async execute() { return { ok: true, output: "bad" }; }
        });
      }
    `);
    const { registry, commands } = loaderDeps({ plugins: { enabled: ["echo"] } });
    const result = await loadEnabledPlugins({ repoRoot: root, registry, commands, settings: { plugins: { enabled: ["echo"] } }, env });
    expect(result.loaded).toEqual([]);
    expect(result.diagnostics[0]?.message).toContain("must start with plugin_echo_");
    expect(registry.get("read_file")).toBeUndefined();
  });

  it("requires plugin tools to provide describeForSafety", async () => {
    await writePlugin(join(home, "plugins"), "echo", `
      export function register(ctx) {
        ctx.registerTool({
          schema: { name: "plugin_echo_say", description: "bad", parameters: { type: "object", properties: {} } },
          async execute() { return { ok: true, output: "bad" }; }
        });
      }
    `);
    const { registry, commands } = loaderDeps({ plugins: { enabled: ["echo"] } });
    const result = await loadEnabledPlugins({ repoRoot: root, registry, commands, settings: { plugins: { enabled: ["echo"] } }, env });
    expect(result.loaded).toEqual([]);
    expect(result.diagnostics[0]?.message).toContain("must define describeForSafety");
  });

  it("plugin tools remain blocked by the central safety gate", async () => {
    await writePlugin(join(home, "plugins"), "echo", echoPlugin);
    const { registry, commands } = loaderDeps({ plugins: { enabled: ["echo"] } });
    await loadEnabledPlugins({ repoRoot: root, registry, commands, settings: { plugins: { enabled: ["echo"] } }, env });
    const assess = vi.fn(async () => ({ risk: "block" as const, needsHuman: false, reason: "blocked test" }));
    const out = await dispatchTool(
      { id: "c1", name: "plugin_echo_say", arguments: {} },
      {
        registry,
        safety: { assess },
        requestApproval: async () => true,
        root,
      } as any,
      { root, safety: { assess } as any, requestApproval: async () => true },
    );
    expect(out.ok).toBe(false);
    expect(out.output).toContain("blocked");
    expect(assess).toHaveBeenCalledWith(expect.stringContaining("plugin echo: echo plugin tool"));
    expect((globalThis as Record<string, unknown>).__pluginRan).toBeUndefined();
  });
});
