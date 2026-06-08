import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { resolveVantaHome } from "../store/home.js";

// PLUGIN-SYSTEM: clean industry-standard plugin install/location hygiene.
// Optional capabilities install into the OS cache or ~/.vanta, NEVER the repo.
// This is the INSTALL-HYGIENE half; PLUGIN-FRAMEWORK handles code extension.

const runExec = promisify(execFile);

export type PluginStatus = "installed" | "available" | "missing-prereq";

export type PluginEntry = {
  id: string;
  label: string;
  description: string;
  /** Where deps land (OS cache, ~/.vanta, etc). */
  depsLocation: string;
  /** Where runtime state lands. */
  stateLocation: string;
  /** How to check if the plugin is installed. */
  checkInstalled: () => Promise<boolean>;
  /** Install the plugin. Throws on failure. */
  install: () => Promise<void>;
  /** Remove the plugin's state (not deps — those are in OS cache). */
  remove: () => Promise<void>;
};

const home = resolveVantaHome;

function chromiumCachePath(): string {
  const platform = process.platform;
  if (platform === "darwin") return `${process.env.HOME}/Library/Caches/ms-playwright`;
  if (platform === "win32") return `${process.env.LOCALAPPDATA}/ms-playwright`;
  return `${process.env.HOME}/.cache/ms-playwright`;
}

export const PLUGIN_CATALOG: PluginEntry[] = [
  {
    id: "browser",
    label: "Browser (Playwright Chromium)",
    description: "Headless browser for web scraping, screenshots, and authenticated browsing.",
    depsLocation: chromiumCachePath(),
    stateLocation: join(home(), "browser-profiles"),
    async checkInstalled() {
      return existsSync(chromiumCachePath());
    },
    async install() {
      await runExec("npx", ["playwright", "install", "chromium"], { timeout: 120_000 });
    },
    async remove() {
      const { rm } = await import("node:fs/promises");
      await rm(join(home(), "browser-profiles"), { recursive: true, force: true }).catch(() => {});
    },
  },
  {
    id: "whatsapp-bridge",
    label: "WhatsApp Bridge (Baileys)",
    description: "Unofficial WhatsApp adapter via Node subprocess. Account ban risk — see warning.",
    depsLocation: join(home(), "whatsapp"),
    stateLocation: join(home(), "whatsapp"),
    async checkInstalled() {
      return existsSync(join(home(), "whatsapp", "node_modules"));
    },
    async install() {
      const { mkdir, writeFile } = await import("node:fs/promises");
      const dir = join(home(), "whatsapp");
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "package.json"), JSON.stringify({ name: "vanta-whatsapp-bridge", dependencies: { "baileys": "latest" } }, null, 2));
      await runExec("npm", ["install", "--prefix", dir], { timeout: 120_000 });
    },
    async remove() {
      const { rm } = await import("node:fs/promises");
      await rm(join(home(), "whatsapp"), { recursive: true, force: true }).catch(() => {});
    },
  },
];

export function pluginById(id: string): PluginEntry | undefined {
  return PLUGIN_CATALOG.find((p) => p.id === id);
}

/** Format the plugins list for display. Pure (no async). */
export function formatPluginList(statuses: Array<{ entry: PluginEntry; installed: boolean }>): string {
  const lines = ["Available capabilities:"];
  for (const { entry, installed } of statuses) {
    const tag = installed ? "[installed]" : "[available]";
    lines.push(`  ${entry.id.padEnd(18)} ${tag}  ${entry.label}`);
    lines.push(`    deps: ${entry.depsLocation}`);
    lines.push(`    state: ${entry.stateLocation}`);
  }
  return lines.join("\n");
}

/** Check all plugins in the repo tree — should be empty. Pure logic, but needs FS. */
export async function checkNoPluginFilesInRepo(repoRoot: string): Promise<string[]> {
  const pluginPaths = [
    join(repoRoot, "node_modules", ".playwright"),
    join(repoRoot, "ms-playwright"),
    join(repoRoot, "whatsapp"),
  ];
  return pluginPaths.filter((p) => existsSync(p));
}
