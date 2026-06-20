import { readdir, readFile, mkdir, cp, rm, stat } from "node:fs/promises";
import {
  loadSettings, writeSettings, userSettingsPath, type Settings,
} from "../settings/store.js";
import { resolveVantaHome } from "../store/home.js";
import {
  listPlugins, setEnabled, installPlugin, uninstallPlugin, type PluginFs,
} from "../plugins/manage.js";

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

/** `vanta plugin [list | enable <name> | disable <name> | install <path> | uninstall <name>]` */
export async function runPlugin(repoRoot: string, rest: string[]): Promise<number> {
  const sub = rest[0] ?? "list";
  switch (sub) {
    case "list": return cmdList(repoRoot);
    case "enable": return cmdEnable(rest[1], true);
    case "disable": return cmdEnable(rest[1], false);
    case "install": return cmdInstall(rest[1]);
    case "uninstall": return cmdUninstall(rest[1]);
    default:
      console.log("usage: vanta plugin [list | enable <name> | disable <name> | install <path> | uninstall <name>]");
      return 1;
  }
}
