import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** A project room: a named subdir under the projects base, runnable in place. */
export type Room = { name: string; path: string };

/**
 * Where Argo looks for project rooms. Each subdir is one project, and the
 * kernel's per-dir `.argo` gives it an isolated goal stream. Override with
 * ARGO_PROJECTS_DIR (tests point this at a temp dir).
 */
export function projectsBaseDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.ARGO_PROJECTS_DIR?.trim();
  return override
    ? override
    : join(homedir(), "Documents", "GitHub", "_active");
}

/**
 * List every project room (one per subdir of the base), sorted by name.
 * Returns [] if the base dir is absent — a missing projects dir is a normal
 * "no projects yet" state, not an error.
 */
export async function listRooms(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Room[]> {
  const base = projectsBaseDir(env);

  let entries;
  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, path: join(base, entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Find a room by exact name among listRooms, or null if none matches. */
export async function resolveRoom(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Room | null> {
  const rooms = await listRooms(env);
  return rooms.find((room) => room.name === name) ?? null;
}
