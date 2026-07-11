import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveVantaHome } from "../store/home.js";
import { parseAutomationBlueprint, type AutomationBlueprint } from "./schema.js";

function bundledDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "automation-blueprints");
}

function userDir(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "automation-blueprints");
}

async function readCatalog(directory: string): Promise<AutomationBlueprint[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const blueprints: AutomationBlueprint[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const blueprint = await readFile(join(directory, entry.name, "blueprint.json"), "utf8")
      .then((text) => parseAutomationBlueprint(JSON.parse(text)))
      .catch(() => null);
    if (blueprint) blueprints.push(blueprint);
  }
  return blueprints;
}

export async function listAutomationBlueprints(env: NodeJS.ProcessEnv = process.env): Promise<AutomationBlueprint[]> {
  const byName = new Map<string, AutomationBlueprint>();
  for (const item of await readCatalog(bundledDir())) byName.set(item.name, item);
  for (const item of await readCatalog(userDir(env))) byName.set(item.name, item);
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getAutomationBlueprint(name: string, env: NodeJS.ProcessEnv = process.env): Promise<AutomationBlueprint | null> {
  return (await listAutomationBlueprints(env)).find((item) => item.name === name) ?? null;
}
