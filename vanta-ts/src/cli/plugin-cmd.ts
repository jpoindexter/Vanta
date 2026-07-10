import { readdir, readFile, mkdir, cp, rm, stat } from "node:fs/promises";
import {
  loadSettings, writeSettings, userSettingsPath, type Settings,
} from "../settings/store.js";
import { resolveVantaHome } from "../store/home.js";
import {
  listPlugins, setEnabled, installPlugin, uninstallPlugin, type PluginFs,
  setPluginCapability,
} from "../plugins/manage.js";
import { isPluginCapability, PLUGIN_CAPABILITIES, type PluginCapability } from "../plugins/capabilities.js";
import { PluginPanelRegistry } from "../plugins/panels.js";
import { PluginCommandRegistry } from "../plugins/commands.js";
import { loadEnabledPlugins } from "../plugins/loader.js";
import { buildRegistry } from "../tools/index.js";
import { SLASH_COMMANDS } from "../repl/catalog.js";

// VANTA-PLUGIN-CLI — the `vanta plugin <sub>` surface. Wires the pure/injectable
// manage.ts core to node fs + the user settings scope. enable/disable persist to
// ~/.vanta/settings.json (plugins.enabled), which the loader already honors.

/** node-backed PluginFs the pure core copies/reads/removes through. */
const nodeFs: PluginFs = {
  readdir: (dir) => readdir(dir),
  readFile: (path) => readFile(path, "utf8"),
  isDirectory: async (path) => {
    try { return (await stat(path)).isDirectory(); } catch { return false; }
  },
  mkdir: async (dir) => { await mkdir(dir, { recursive: true }); },
  copyDir: async (from, to) => { await cp(from, to, { recursive: true }); },
  rmDir: async (dir) => { await rm(dir, { recursive: true, force: true }); },
};

/** Load the USER settings scope only (the home for ~/.vanta plugin enable-list). */
async function readUserSettings(): Promise<Settings> {
  try {
    const parsed = JSON.parse(await readFile(userSettingsPath(process.env), "utf8"));
    return (parsed && typeof parsed === "object") ? (parsed as Settings) : {};
  } catch {
    return {};
  }
}

/** Persist a setEnabled() transform to the user settings scope. */
async function persistEnabled(name: string, on: boolean): Promise<void> {
  const next = setEnabled(await readUserSettings(), name, on);
  await writeSettings(userSettingsPath(process.env), next);
}

async function persistCapability(name: string, capability: PluginCapability, on: boolean): Promise<void> {
  const next = setPluginCapability(await readUserSettings(), name, capability, on);
  await writeSettings(userSettingsPath(process.env), next);
}

async function cmdList(repoRoot: string): Promise<number> {
  const home = resolveVantaHome(process.env);
  const settings = await loadSettings(repoRoot, process.env);
  const plugins = await listPlugins(nodeFs, home, settings);
  if (!plugins.length) {
    console.log(`  (no plugins installed — ${home}/plugins is empty)`);
    return 0;
  }
  for (const p of plugins) {
    const mark = p.enabled ? "●" : "○";
    const desc = p.description ? ` — ${p.description}` : "";
    console.log(`  ${mark} ${p.name}@${p.version}${desc}`);
  }
  console.log(`  (● enabled · ○ disabled — toggle with: vanta plugin enable|disable <name>)`);
  return 0;
}

async function cmdEnable(name: string | undefined, on: boolean): Promise<number> {
  if (!name) { console.error(`usage: vanta plugin ${on ? "enable" : "disable"} <name>`); return 1; }
  await persistEnabled(name, on);
  console.log(`✓ ${on ? "enabled" : "disabled"} ${name} (settings.plugins.enabled)`);
  if (on) console.log("  (the loader honors this on the next session start)");
  return 0;
}

async function cmdInstall(src: string | undefined): Promise<number> {
  if (!src) { console.error("usage: vanta plugin install <path>"); return 1; }
  const res = await installPlugin(src, nodeFs, resolveVantaHome(process.env));
  if (!res.ok) { console.error(res.error); return 1; }
  console.log(`✓ installed ${res.value.name}@${res.value.version} (staged, DISABLED)`);
  console.log(`  enable it with: vanta plugin enable ${res.value.name}`);
  return 0;
}

async function cmdUninstall(name: string | undefined): Promise<number> {
  if (!name) { console.error("usage: vanta plugin uninstall <name>"); return 1; }
  const res = await uninstallPlugin(name, nodeFs, resolveVantaHome(process.env));
  if (!res.ok) { console.error(res.error); return 1; }
  // Also drop a lingering enabled-list entry so the loader doesn't report it missing.
  await persistEnabled(name, false);
  console.log(`✓ uninstalled ${name}`);
  return 0;
}

async function cmdCapability(name: string | undefined, capability: string | undefined, on: boolean): Promise<number> {
  if (!name || !capability) {
    console.error(`usage: vanta plugin ${on ? "grant" : "revoke"} <name> <capability>`);
    return 1;
  }
  if (!isPluginCapability(capability)) {
    console.error(`unknown plugin capability: ${capability}\n  available: ${PLUGIN_CAPABILITIES.join(", ")}`);
    return 1;
  }
  await persistCapability(name, capability, on);
  console.log(`✓ ${on ? "granted" : "revoked"} ${capability} ${on ? "to" : "from"} ${name}`);
  console.log("  (the worker receives the updated grants on the next session start)");
  return 0;
}

async function cmdCapabilities(name: string | undefined): Promise<number> {
  const granted = name ? new Set((await readUserSettings()).plugins?.capabilities?.[name] ?? []) : new Set<PluginCapability>();
  if (name) console.log(`  ${name} worker capabilities:`);
  for (const capability of PLUGIN_CAPABILITIES) console.log(`  ${name ? (granted.has(capability) ? "●" : "○") : "·"} ${capability}`);
  return 0;
}

async function cmdCheck(repoRoot: string, name: string | undefined, waitArg: string | undefined): Promise<number> {
  if (!name) { console.error("usage: vanta plugin check <name> [wait-ms]"); return 1; }
  const waitMs = waitArg === undefined ? 0 : Number(waitArg);
  if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 30_000) {
    console.error("plugin check wait-ms must be an integer from 0 to 30000");
    return 1;
  }
  const settings = await loadSettings(repoRoot, process.env);
  if (!(settings.plugins?.enabled ?? []).includes(name)) {
    console.error(`plugin ${name} is not enabled`);
    return 1;
  }
  const panels = new PluginPanelRegistry();
  const loaded = await loadEnabledPlugins({
    repoRoot,
    registry: buildRegistry(),
    commands: new PluginCommandRegistry(new Set(SLASH_COMMANDS.map((command) => command.name))),
    settings: { ...settings, plugins: { ...settings.plugins, enabled: [name] } },
    env: process.env,
    panels,
    log: (message) => console.log(message),
  });
  try {
    const diagnostic = loaded.diagnostics.find((entry) => entry.plugin === name);
    if (!diagnostic?.ok) {
      console.error(`✗ ${name}: ${diagnostic?.message ?? "not found"}`);
      return 1;
    }
    for (const worker of loaded.workers) console.log(`  worker pid ${worker.pid} · grants ${worker.granted.join(", ") || "none"}`);
    for (const panel of panels.list()) console.log(`  panel ${panel.title} · ${panel.lines.join(" · ")}`);
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    console.log(`✓ ${name} plugin check passed`);
    return 0;
  } finally {
    for (const worker of loaded.workers) worker.dispose();
    for (const monitor of loaded.monitors) monitor.disarm();
  }
}

/** `vanta plugin [list | enable <name> | disable <name> | install <path> | uninstall <name>]` */
export async function runPlugin(repoRoot: string, rest: string[]): Promise<number> {
  const sub = rest[0] ?? "list";
  switch (sub) {
    case "list": return cmdList(repoRoot);
    case "enable": return cmdEnable(rest[1], true);
    case "disable": return cmdEnable(rest[1], false);
    case "install": return cmdInstall(rest[1]);
    case "uninstall": return cmdUninstall(rest[1]);
    case "grant": return cmdCapability(rest[1], rest[2], true);
    case "revoke": return cmdCapability(rest[1], rest[2], false);
    case "capabilities": return cmdCapabilities(rest[1]);
    case "check": return cmdCheck(repoRoot, rest[1], rest[2]);
    default:
      console.log("usage: vanta plugin [list | enable <name> | disable <name> | install <path> | uninstall <name> | capabilities [name] | grant <name> <capability> | revoke <name> <capability> | check <name> [wait-ms]]");
      return 1;
  }
}
