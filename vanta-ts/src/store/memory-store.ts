import { readFile, writeFile, appendFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveVantaHome, ensureVantaStore, commitInHome } from "./home.js";

// The MemoryStore PORT — the persistence seam for Vanta's durable state. Today
// every store hardwires resolveVantaHome + node:fs (the single biggest coupling
// in the codebase). Consumers depend on this namespaced read/write/list/commit
// surface instead; the fs+git ~/.vanta home is the DEFAULT adapter. Backing
// memory with sqlite / a remote / an encrypted store then becomes one new
// adapter + one registration, zero consumer edits. Migrated in waves (brain +
// memory first); each wave's files are enforced by the `memory-store-port`
// fitness rule as they land.

export type MemoryStore = {
  /** Adapter id (e.g. "fs-git"). */
  id: string;
  /** Ensure the backing store exists (dirs, versioning). Returns the home path. */
  ensure(): Promise<string>;
  /** Read a value under <namespace>/<key>, or null when absent. */
  read(ns: string, key: string): Promise<string | null>;
  /** Overwrite a value (creating parent namespaces as needed). */
  write(ns: string, key: string, content: string): Promise<void>;
  /** Append to a value (creating it if absent). */
  append(ns: string, key: string, content: string): Promise<void>;
  /** List the keys in a namespace (empty when the namespace is absent). */
  list(ns: string): Promise<string[]>;
  /** True when a value exists. */
  exists(ns: string, key: string): boolean;
  /** Persist a changed value to the store's version history (best-effort). */
  commit(ns: string, key: string, message: string): Promise<void>;
  /** Absolute path for a namespace (+ optional key) — escape hatch for callers
   *  that genuinely need a path (git, archive dirs). */
  abspath(ns: string, key?: string): string;
};

/** The default adapter: the fs + git ~/.vanta home (store/home.ts). */
function fsGitStore(env: NodeJS.ProcessEnv): MemoryStore {
  const abspath = (ns: string, key?: string): string =>
    key === undefined ? join(resolveVantaHome(env), ns) : join(resolveVantaHome(env), ns, key);
  return {
    id: "fs-git",
    ensure: () => ensureVantaStore(env),
    read: (ns, key) => readFile(abspath(ns, key), "utf8").then((s) => s as string | null).catch(() => null),
    write: async (ns, key, content) => {
      await mkdir(dirname(abspath(ns, key)), { recursive: true });
      await writeFile(abspath(ns, key), content, "utf8");
    },
    append: async (ns, key, content) => {
      await mkdir(dirname(abspath(ns, key)), { recursive: true });
      await appendFile(abspath(ns, key), content, "utf8");
    },
    list: (ns) => readdir(abspath(ns)).catch(() => []),
    exists: (ns, key) => existsSync(abspath(ns, key)),
    commit: (ns, key, message) => commitInHome(join(ns, key), message, env),
    abspath,
  };
}

// One registration point. Add a store backend = one entry + one adapter.
const ADAPTERS: Readonly<Record<string, (env: NodeJS.ProcessEnv) => MemoryStore>> = {
  "fs-git": fsGitStore,
};

/** Resolve the active memory store (VANTA_STORE, default "fs-git"), bound to env. */
export function resolveMemoryStore(env: NodeJS.ProcessEnv = process.env): MemoryStore {
  const make = ADAPTERS[(env.VANTA_STORE ?? "fs-git").toLowerCase()] ?? fsGitStore;
  return make(env);
}
