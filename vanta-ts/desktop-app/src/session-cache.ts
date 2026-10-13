import type { Session } from "./types.js";

const KEY = "vanta.desktop.sessions-cache.v1";
const MAX_CACHED = 100;

type CacheStorage = Pick<Storage, "getItem" | "setItem">;

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.title === "string" && typeof row.turns === "number" && typeof row.updated === "string";
}

/** Last sessions list the server returned, so the sidebar paints before the runtime answers. */
export function loadCachedSessions(storage: CacheStorage | undefined): Session[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isSession).slice(0, MAX_CACHED) : [];
  } catch {
    return [];
  }
}

export function saveCachedSessions(storage: CacheStorage | undefined, sessions: Session[]): void {
  try {
    storage?.setItem(KEY, JSON.stringify(sessions.slice(0, MAX_CACHED)));
  } catch {
    // Cache is best-effort: a full or blocked storage must not break refresh.
  }
}

/** localStorage, or undefined where it is blocked (sandboxed frames, private modes). */
export function browserStorage(): CacheStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
