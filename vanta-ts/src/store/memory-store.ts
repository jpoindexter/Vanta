import { readFile, appendFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveVantaHome, ensureVantaStore, commitInHome } from "./home.js";

/**
 * The persistence PORT for the Vanta home store. Namespaced file ops
 * (read/write/append/list) + ensure + commit — deliberately backend-agnostic
 * (no filesystem `dir()` leak) so the default fs adapter can later be swapped
 * for sqlite/remote/encrypted WITHOUT touching consumers. (ports/adapters,
 * DECISIONS 2026-06-17.)
 *
 * WAVE 1: the port + fs adapter exist and memory/store.ts is migrated as the
 * proof. The remaining ~37 modules that import store/home.ts directly migrate in
 * later waves (PORT-MEMORY-STORE) — each independently shippable + verified.
 */
export interface MemoryStore {
  ensure(): Promise<void>;
  read(ns: string, file: string): Promise<string | null>;
  write(ns: string, file: string, content: string): Promise<void>;
  append(ns: string, file: string, content: string): Promise<void>;
  list(ns: string): Promise<string[]>;
  commit(ns: string, file: string, message: string): Promise<void>;
}

/** Default adapter: the git-versioned ~/.vanta filesystem (via store/home.ts). */
export function fsMemoryStore(env: NodeJS.ProcessEnv = process.env): MemoryStore {
  const path = (ns: string, file?: string): string =>
    file ? join(resolveVantaHome(env), ns, file) : join(resolveVantaHome(env), ns);
  return {
    ensure: () => ensureVantaStore(env).then(() => undefined),
    async read(ns, file) {
      return readFile(path(ns, file), "utf8").catch(() => null);
    },
    async write(ns, file, content) {
      await mkdir(path(ns), { recursive: true });
      await writeFile(path(ns, file), content, "utf8");
    },
    async append(ns, file, content) {
      await mkdir(path(ns), { recursive: true });
      await appendFile(path(ns, file), content, "utf8");
    },
    async list(ns) {
      return readdir(path(ns)).catch(() => []);
    },
    commit: (ns, file, message) => commitInHome(join(ns, file), message, env),
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
