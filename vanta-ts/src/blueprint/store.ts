import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveVantaHome } from "../store/home.js";
import { parseBlueprint, type Blueprint } from "./apply.js";

// VANTA-BLUEPRINTS store: blueprints are `blueprint.json` files under a
// blueprints/ dir. Two sources — the BUNDLED library (vanta-ts/blueprints/, ships
// with Vanta) and the USER dir (~/.vanta/blueprints/, addable without touching
// src/). A user blueprint overrides a bundled one of the same name.

/** vanta-ts/blueprints — the bundled library (this file is src/blueprint/store.ts). */
function bundledDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "blueprints");
}

function userDir(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "blueprints");
}

/** Read each subdir's blueprint.json under `dir` into validated Blueprints (bad ones skipped). */
async function readBlueprintsFrom(dir: string): Promise<Blueprint[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: Blueprint[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const bp = await readFile(join(dir, e.name, "blueprint.json"), "utf8")
      .then((t) => parseBlueprint(JSON.parse(t)))
      .catch(() => null);
    if (bp) out.push(bp);
  }
  return out;
}

/** All available blueprints, user overriding bundled by name (sorted). */
export async function listBlueprints(env: NodeJS.ProcessEnv = process.env): Promise<Blueprint[]> {
  const byName = new Map<string, Blueprint>();
  for (const bp of await readBlueprintsFrom(bundledDir())) byName.set(bp.name, bp);
  for (const bp of await readBlueprintsFrom(userDir(env))) byName.set(bp.name, bp); // user wins
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Resolve one blueprint by name, or null. */
export async function getBlueprint(name: string, env: NodeJS.ProcessEnv = process.env): Promise<Blueprint | null> {
  return (await listBlueprints(env)).find((b) => b.name === name) ?? null;
}
