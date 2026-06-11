import { mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { LoopDefSchema, LoopStateSchema, newState } from "./types.js";
import type { LoopDef, LoopState } from "./types.js";

// Persistence for first-class loops. Each loop is two files under
// `.vanta/loops/`: `<id>.json` (the immutable def) and `<id>.state.json` (mutable
// progress). Split so the runner can rewrite state every iteration without
// touching — or racing — the def the operator authored. Reads are tolerant: a
// malformed def is skipped (never crashes `loop list`), a malformed state resets
// to zero rather than wedging the loop.

export function loopsDir(dataDir: string): string {
  return join(dataDir, "loops");
}

const defPath = (dataDir: string, id: string): string => join(loopsDir(dataDir), `${id}.json`);
const statePath = (dataDir: string, id: string): string => join(loopsDir(dataDir), `${id}.state.json`);

/** Loop ids are filename-safe and CLI-friendly: lowercase, digits, dash. */
export function isValidLoopId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(id);
}

export async function saveDef(dataDir: string, def: LoopDef): Promise<void> {
  await mkdir(loopsDir(dataDir), { recursive: true });
  await writeFile(defPath(dataDir, def.id), `${JSON.stringify(def, null, 2)}\n`, "utf8");
}

export async function loadDef(dataDir: string, id: string): Promise<LoopDef | null> {
  return readJson(defPath(dataDir, id), (raw) => {
    const parsed = LoopDefSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  });
}

/** All defs, newest-created first. Malformed files are silently skipped. */
export async function listDefs(dataDir: string): Promise<LoopDef[]> {
  let names: string[];
  try {
    names = await readdir(loopsDir(dataDir));
  } catch {
    return [];
  }
  const ids = names.filter((n) => n.endsWith(".json") && !n.endsWith(".state.json")).map((n) => n.slice(0, -5));
  const defs = await Promise.all(ids.map((id) => loadDef(dataDir, id)));
  return defs
    .filter((d): d is LoopDef => d !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveState(dataDir: string, state: LoopState): Promise<void> {
  await mkdir(loopsDir(dataDir), { recursive: true });
  await writeFile(statePath(dataDir, state.id), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

/** State for a loop, defaulting to a fresh zeroed state when absent or corrupt. */
export async function loadState(dataDir: string, id: string): Promise<LoopState> {
  const loaded = await readJson(statePath(dataDir, id), (raw) => {
    const parsed = LoopStateSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  });
  return loaded ?? newState(id);
}

/** Remove a loop entirely — both def and state. Used by `vanta loop kill --purge`. */
export async function removeLoop(dataDir: string, id: string): Promise<void> {
  await rm(defPath(dataDir, id), { force: true });
  await rm(statePath(dataDir, id), { force: true });
}

async function readJson<T>(path: string, parse: (raw: unknown) => T | null): Promise<T | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return null;
  }
  try {
    return parse(JSON.parse(raw));
  } catch {
    return null;
  }
}
