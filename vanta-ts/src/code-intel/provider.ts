// The CodeIntelProvider PORT — gives Vanta-the-operator code intelligence
// (what-calls-what, where-defined, blast-radius) so the factory/executor stops
// acting on code blind. Built as a swappable port: codegraph is the default
// ADAPTER (code-intel/codegraph.ts), reachable only through this interface.
// HARD constraints: nothing outside the adapter imports the engine (enforced by
// the `code-intel-seam` fitness rule); methods return Result and NEVER throw; an
// absent/unconfigured engine is a graceful no-op via available().

export type Ok<T> = { ok: true; value: T };
export type Err<E> = { ok: false; error: E };
export type Result<T, E = string> = Ok<T> | Err<E>;
export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const UNAVAILABLE = "code intelligence unavailable — no provider/engine present (run code_index, or install codegraph)";

export type CodeIntelProvider = {
  /** Adapter id (e.g. "codegraph", "none"). */
  id: string;
  /** True when the engine is installed and usable for this root. Never throws. */
  available(): Promise<boolean>;
  /** Build focused markdown context for a task. */
  context(task: string): Promise<Result<string>>;
  /** Find a symbol by name. */
  search(symbol: string): Promise<Result<string>>;
  /** Find files/tests affected by changes to the given files. */
  affected(files: string[]): Promise<Result<string>>;
  /** Ensure the index exists/up to date (builds or syncs it). */
  ensureIndexed(): Promise<Result<string>>;
};

/** The no-op provider: used when code intelligence is off or absent. Every call
 *  degrades gracefully — the operator keeps working without code intel. */
export const nullProvider: CodeIntelProvider = {
  id: "none",
  available: async () => false,
  context: async () => err(UNAVAILABLE),
  search: async () => err(UNAVAILABLE),
  affected: async () => err(UNAVAILABLE),
  ensureIndexed: async () => err(UNAVAILABLE),
};
