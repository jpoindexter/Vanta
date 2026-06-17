import { readFile, appendFile, writeFile, readdir, mkdir, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { resolveVantaHome, ensureVantaStore, commitInHome } from "./home.js";

/**
 * The persistence PORT for the Vanta home store. File ops keyed by a path
 * RELATIVE to the home root (e.g. "world.jsonl", "memories/5.md") + ensure +
 * commit + list. Deliberately backend-agnostic (a path key, not a filesystem
 * handle) so the default fs adapter can later be swapped for sqlite/remote/
 * encrypted WITHOUT touching consumers. (ports/adapters, DECISIONS 2026-06-17.)
 *
 * Consumers must use {@link resolveMemoryStore} — never store/home.ts directly.
 */
export interface MemoryStore {
  ensure(): Promise<void>;
  /** Read a home-relative path, or null if missing/unreadable. */
  read(path: string): Promise<string | null>;
  /** Write (create dirs as needed) a home-relative path. */
  write(path: string, content: string): Promise<void>;
  /** Append (create dirs as needed) to a home-relative path. */
  append(path: string, content: string): Promise<void>;
  /** List filenames in a home-relative directory ("" = the home root). */
  list(dir: string): Promise<string[]>;
  /** Delete a home-relative path. Idempotent — a missing path is not an error. */
  remove(path: string): Promise<void>;
  /** Best-effort git commit of a home-relative path. Never throws. */
  commit(path: string, message: string): Promise<void>;
}

/** Default adapter: the git-versioned ~/.vanta filesystem (via store/home.ts). */
export function fsMemoryStore(env: NodeJS.ProcessEnv = process.env): MemoryStore {
  const abs = (rel: string): string => join(resolveVantaHome(env), rel);
  return {
    ensure: () => ensureVantaStore(env).then(() => undefined),
    async read(path) {
      return readFile(abs(path), "utf8").catch(() => null);
    },
    async write(path, content) {
      await mkdir(dirname(abs(path)), { recursive: true });
      await writeFile(abs(path), content, "utf8");
    },
    async append(path, content) {
      await mkdir(dirname(abs(path)), { recursive: true });
      await appendFile(abs(path), content, "utf8");
    },
    async list(dir) {
      return readdir(abs(dir)).catch(() => []);
    },
    async remove(path) {
      await rm(abs(path), { force: true });
    },
    commit: (path, message) => commitInHome(path, message, env),
  };
}

/**
 * Resolve the active memory store from environment.
 *   VANTA_MEMORY_STORE=fs (default) → the ~/.vanta filesystem adapter
 * To back it with sqlite/remote: implement {@link MemoryStore}, add a case here.
 */
export function resolveMemoryStore(env: NodeJS.ProcessEnv = process.env): MemoryStore {
  const which = (env.VANTA_MEMORY_STORE ?? "fs").toLowerCase();
  switch (which) {
    case "fs":
    case "default":
      return fsMemoryStore(env);
    default:
      throw new Error(`Unknown VANTA_MEMORY_STORE "${which}". Use fs (default).`);
  }
}
