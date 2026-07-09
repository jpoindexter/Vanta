import { readdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { ensureBrain, brainDir } from "../brain/store.js";
import { BRAIN_REGIONS } from "../brain/regions.js";
import { sessionMemoryPath } from "../memory/session-memory.js";
import { resolveMemoryStore } from "../store/memory-store.js";
import { openInEditor } from "../editor/open.js";

export type MemoryFileRow = {
  id: string;
  label: string;
  source: "brain" | "goal" | "session";
  path: string;
  detail: string;
  exists: boolean;
};

export type MemoryOverlayData = {
  rows: MemoryFileRow[];
};

function fileDetail(path: string, exists: boolean): string {
  if (!exists) return "not created yet";
  try {
    const stat = statSync(path);
    return `${Math.max(0, Math.round(stat.size / 1024))} KB · ${stat.mtime.toISOString().slice(0, 10)}`;
  } catch {
    return "available";
  }
}

function brainRows(env: NodeJS.ProcessEnv): MemoryFileRow[] {
  const dir = brainDir(env);
  return BRAIN_REGIONS.map((region) => {
    const path = join(dir, `${region.name}.md`);
    const exists = existsSync(path);
    return {
      id: `brain:${region.name}`,
      label: region.title,
      source: "brain",
      path,
      detail: fileDetail(path, exists),
      exists,
    };
  });
}

async function goalRows(env: NodeJS.ProcessEnv): Promise<MemoryFileRow[]> {
  const store = resolveMemoryStore(env);
  const keys = (await store.list("memories")).filter((key) => key.endsWith(".md")).sort();
  return keys.map((key) => {
    const path = store.abspath("memories", key);
    const exists = existsSync(path);
    return {
      id: `goal:${key}`,
      label: `Goal memory ${key.replace(/\.md$/, "")}`,
      source: "goal",
      path,
      detail: fileDetail(path, exists),
      exists,
    };
  });
}

async function sessionRows(dataDir: string): Promise<MemoryFileRow[]> {
  const path = sessionMemoryPath(dataDir);
  const exists = existsSync(path);
  const extras = await readdir(dataDir).catch(() => []);
  const detail = exists ? fileDetail(path, true) : extras.length ? "not created yet" : "session store empty";
  return [{ id: "session:scratchpad", label: "Session scratchpad", source: "session", path, detail, exists }];
}

export async function loadMemoryOverlayData(repoRoot: string, env: NodeJS.ProcessEnv = process.env): Promise<MemoryOverlayData> {
  await ensureBrain(env);
  const dataDir = join(repoRoot, ".vanta");
  return { rows: [...await sessionRows(dataDir), ...brainRows(env), ...await goalRows(env)] };
}

export async function openMemoryFile(row: MemoryFileRow, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  if (!row.exists) return `${row.label} has not been written yet`;
  const result = await openInEditor(row.path, env);
  return result.message;
}
