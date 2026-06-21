// VANTA-FILE-INDEX — a lazily-built file index backing fast @file mention
// completion. Sibling to ui/path-complete.ts (per-keystroke directory listing)
// and term/at-context.ts (the current @-ref completion source): same pure +
// injected-walk shape, but here the project's relative paths are walked ONCE,
// noise-filtered, and cached so prefix/fuzzy queries don't re-walk the tree on
// every keystroke.
//
// Wiring (NOT done this round, mirrors clarity-gate): the composer's @-completion
// — today term/at-context.ts `activeAtRef(input)` extracts the partial after the
// last `@`, and ui/at.ts powers the palette from `listRepoFiles` on each open —
// would instead call `getFileIndex({ walk, root })` (build-once, cached) and then
// `queryFileIndex(index, partial)` to rank matches without re-walking. `walk` is
// the injected fs boundary: an async/sync lister yielding in-root relative POSIX
// paths (e.g. wrapping at-context's `listRepoFiles(root)`). A buffer edit that
// adds a file calls `invalidateFileIndex()` so the next demand rebuilds.
//
// SECURITY: the index holds RELATIVE paths only. It never reads file contents and
// never walks itself — the injected `walk` is responsible for yielding only
// in-root paths (listRepoFiles already does), so nothing outside root is indexed.

/** Default cap on returned matches — a completion palette stays readable. */
export const DEFAULT_MAX_RESULTS = 20;

/** Directory names whose subtrees are noise for @file completion. */
const NOISE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".vanta",
]);

/** One indexed file: its relative path plus the precomputed lowercase basename. */
export interface IndexedFile {
  /** The repo-relative POSIX path as the walk yielded it. */
  readonly path: string;
  /** `path` lowercased once, for case-insensitive path-substring matching. */
  readonly lowerPath: string;
  /** The final path segment, lowercased, for basename matching/ranking. */
  readonly basename: string;
}

/** A built, queryable file index — the indexed files in walk order. */
export interface FileIndex {
  readonly files: readonly IndexedFile[];
}

/** Injected dependencies for the lazy holder. `walk` is the fs boundary. */
export interface FileIndexDeps {
  /** Yield in-root relative POSIX paths. MAY throw — a throw → empty index. */
  readonly walk: (root: string) => readonly string[];
  /** The project root the walk is rooted at (passed through to `walk`). */
  readonly root: string;
}

/**
 * Build a queryable index from a list of repo-relative paths (PURE).
 * Drops noise paths — any path with a segment in NOISE_DIRS or a dotfile-dir
 * segment (a leading-dot directory like `.cache`, but NOT a leading-dot file at
 * the leaf) — and precomputes each survivor's lowercase path + basename so
 * queries do no per-call string work beyond comparison. An empty (or
 * all-filtered) input yields an index with no files → no matches.
 */
export function buildFileIndex(relPaths: readonly string[]): FileIndex {
  const files: IndexedFile[] = [];
  for (const path of relPaths) {
    if (isNoisePath(path)) continue;
    const lowerPath = path.toLowerCase();
    const slash = lowerPath.lastIndexOf("/");
    const basename = slash === -1 ? lowerPath : lowerPath.slice(slash + 1);
    files.push({ path, lowerPath, basename });
  }
  return { files };
}

/** A path is noise if any directory segment is a noise dir or a dotfile dir. */
function isNoisePath(path: string): boolean {
  const segments = path.split("/");
  // The last segment is the leaf file; only the preceding segments are dirs.
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    if (NOISE_DIRS.has(seg) || seg.startsWith(".")) return true;
  }
  return false;
}

/** Rank tiers — lower sorts first; basename-startsWith beats everything. */
const RANK_BASENAME_STARTS = 0;
const RANK_BASENAME_CONTAINS = 1;
const RANK_PATH_CONTAINS = 2;
const RANK_NONE = 3;

/**
 * Query the index for a fragment, returning ranked relative paths (PURE).
 * Matching is case-insensitive on the basename OR the full path. Ranking:
 * basename-startsWith > basename-contains > path-contains, then shorter path
 * wins ties (then path ascending for determinism). Results cap at `max`
 * (default 20). An empty/whitespace fragment returns the first `max` paths
 * (recent/first N — the index's walk order). No match → `[]`.
 */
export function queryFileIndex(
  index: FileIndex,
  fragment: string,
  max: number = DEFAULT_MAX_RESULTS,
): string[] {
  const needle = fragment.trim().toLowerCase();
  if (needle === "") {
    return index.files.slice(0, max).map((f) => f.path);
  }

  const ranked: { file: IndexedFile; rank: number }[] = [];
  for (const file of index.files) {
    const rank = rankOf(file, needle);
    if (rank !== RANK_NONE) ranked.push({ file, rank });
  }

  ranked.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.file.path.length - b.file.path.length ||
      a.file.path.localeCompare(b.file.path),
  );
  return ranked.slice(0, max).map((r) => r.file.path);
}

/** The best matching tier for one file against an already-lowercased needle. */
function rankOf(file: IndexedFile, needle: string): number {
  if (file.basename.startsWith(needle)) return RANK_BASENAME_STARTS;
  if (file.basename.includes(needle)) return RANK_BASENAME_CONTAINS;
  if (file.lowerPath.includes(needle)) return RANK_PATH_CONTAINS;
  return RANK_NONE;
}

/**
 * Lazy singleton holder: builds the index ONCE on first `get`, caches it, and
 * rebuilds only after `invalidate`. A `walk` throw is caught and yields an empty
 * index (cached like any other) so the holder never throws to its caller.
 */
export class FileIndexHolder {
  private cached: FileIndex | null = null;

  /** Return the cached index, building it from `deps` on first demand. */
  get(deps: FileIndexDeps): FileIndex {
    if (this.cached !== null) return this.cached;
    this.cached = buildFromDeps(deps);
    return this.cached;
  }

  /** Drop the cache so the next `get` rebuilds (e.g. a new file appeared). */
  invalidate(): void {
    this.cached = null;
  }
}

/** Run the injected walk and build, converting any throw into an empty index. */
function buildFromDeps(deps: FileIndexDeps): FileIndex {
  let paths: readonly string[];
  try {
    paths = deps.walk(deps.root);
  } catch {
    paths = [];
  }
  return buildFileIndex(paths);
}

/** Process-wide default holder for the live @-completion path. */
const defaultHolder = new FileIndexHolder();

/** Get the lazily-built process index (build-once, cached). */
export function getFileIndex(deps: FileIndexDeps): FileIndex {
  return defaultHolder.get(deps);
}

/** Reset the process index so the next `getFileIndex` rebuilds. */
export function invalidateFileIndex(): void {
  defaultHolder.invalidate();
}
