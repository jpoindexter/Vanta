/**
 * Code intelligence port. Mirrors {@link SearchProvider}: a typed, swappable
 * capability resolved from environment. The default adapter shells out to the
 * standalone `codegraph` CLI, but ANY engine (a future in-house indexer, a
 * different MCP, a remote service) can implement this interface and drop in via
 * one registration change in ./index.ts — nothing else in Vanta references the
 * engine. This is the reference implementation of Vanta's ports/adapters
 * standard (DECISIONS 2026-06-17).
 *
 * Methods MAY throw on engine/exec failure — the calling tool catches and
 * returns errors-as-values, so the agent loop never crashes on code intel.
 */

/** Symbol kinds a search can filter by (superset; engines ignore unknown kinds). */
export type CodeSymbolKind =
  | "function"
  | "method"
  | "class"
  | "interface"
  | "type"
  | "variable"
  | "route"
  | "component";

/** Where to run — defaults to the engine's notion of the current project. */
export type CodeIntelScope = { root?: string };

export type CodeContextOptions = CodeIntelScope & { maxNodes?: number; includeCode?: boolean };
export type CodeSearchOptions = CodeIntelScope & { kind?: CodeSymbolKind; limit?: number };
export type CodeIndexOptions = CodeIntelScope & { force?: boolean };

export interface CodeIntelProvider {
  /** Stable id: "codegraph" | "null" | <future engine>. */
  readonly id: string;
  /** Cheap check — is the engine installed and usable right now? */
  isAvailable(): Promise<boolean>;
  /** Task-focused context as markdown (entry points + related symbols + code). */
  context(task: string, opts?: CodeContextOptions): Promise<string>;
  /** Locate symbols by name; returns engine-formatted locations. */
  search(query: string, opts?: CodeSearchOptions): Promise<string>;
  /** Map changed files to affected tests / blast radius. */
  affected(files: string[], opts?: CodeIntelScope): Promise<string>;
  /** Index status + statistics for the scope. */
  status(opts?: CodeIntelScope): Promise<string>;
  /** Build/refresh the index for the scope. */
  index(opts?: CodeIndexOptions): Promise<string>;
  /** Incremental update since last index. */
  sync(opts?: CodeIntelScope): Promise<string>;
}
