// VANTA-SESSION-ENV — session-scoped environment variables injected into child
// process spawns (shell_cmd / run_code). A convenience layer ONLY: it changes
// the child's env, never the kernel gate — every command is still assess()'d.
//
// The store is a process-scoped holder so the `/env` handler (REPL) and the
// spawn site (tools/shell-cmd.ts) share one source of truth without threading
// it through ToolContext. parseEnvArg + applySessionEnv are pure and tested.

/** A KEY=value mapping applied on top of the base env for child spawns. */
export type SessionEnv = Readonly<Record<string, string>>;

/** Parsed intent of a `/env` argument. */
export type EnvAction =
  | { action: "set"; key: string; value: string }
  | { action: "unset"; key: string }
  | { action: "list" }
  | { action: "error"; message: string };

// A POSIX-ish env var name: letter/underscore start, then alnum/underscore.
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Parse a `/env` argument into an intent. Pure — no store access.
 *  `KEY=value` → set · `-KEY` → unset · empty → list · malformed → error.
 *  The whole argument is trimmed at the boundary first (so `KEY= v ` yields the
 *  value ` v`: inner leading space kept, outer trailing space dropped). */
export function parseEnvArg(arg: string): EnvAction {
  const trimmed = arg.trim();
  if (trimmed === "") return { action: "list" };

  if (trimmed.startsWith("-")) {
    const key = trimmed.slice(1).trim();
    if (!KEY_RE.test(key)) {
      return { action: "error", message: `invalid env var name "${key}". Use -KEY where KEY is a letter/underscore then letters/digits/underscores.` };
    }
    return { action: "unset", key };
  }

  const eq = trimmed.indexOf("=");
  if (eq < 0) {
    return { action: "error", message: `expected KEY=value, -KEY, or no argument. Got "${trimmed}".` };
  }
  const key = trimmed.slice(0, eq).trim();
  const value = trimmed.slice(eq + 1);
  if (!KEY_RE.test(key)) {
    return { action: "error", message: `invalid env var name "${key}". A name is a letter/underscore then letters/digits/underscores.` };
  }
  return { action: "set", key, value };
}

/** Merge session vars over a base env, non-mutating. Session vars override base.
 *  Empty session env → returns the base env object UNCHANGED (same reference),
 *  so a spawn with no session env is byte-identical to today. */
export function applySessionEnv(baseEnv: NodeJS.ProcessEnv, sessionEnv: SessionEnv): NodeJS.ProcessEnv {
  const keys = Object.keys(sessionEnv);
  if (keys.length === 0) return baseEnv;
  return { ...baseEnv, ...sessionEnv };
}

/** Process-scoped session-env holder. One instance per process; the `/env`
 *  handler mutates it and the spawn site reads it. Injectable for tests. */
export class SessionEnvStore {
  private readonly vars = new Map<string, string>();

  /** Set (or replace) a session var. */
  set(key: string, value: string): void {
    this.vars.set(key, value);
  }

  /** Unset a session var. Returns true if it existed. */
  unset(key: string): boolean {
    return this.vars.delete(key);
  }

  /** Snapshot the current vars as a plain immutable record. */
  snapshot(): SessionEnv {
    return Object.freeze(Object.fromEntries(this.vars));
  }

  /** Number of set vars. */
  get size(): number {
    return this.vars.size;
  }

  /** Clear all session vars. */
  clear(): void {
    this.vars.clear();
  }
}

/** The shared process-scoped store the REPL handler and spawn site both use. */
export const sessionEnvStore = new SessionEnvStore();
