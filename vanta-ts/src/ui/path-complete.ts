// VANTA-PATH-COMPLETE — pure file/directory path tab-completion for the prompt.
// Sibling to the @-file palette (term/at-context.ts, ui/at.ts): same inject-a-lister,
// pure-and-tested shape, but for a partial filesystem path in the composer buffer.
//
// Wiring (NOT done this round, mirrors clarity-gate): ui/composer.tsx's Tab handler
// would call completePath(activePartial, { listDir }) where `listDir` reads the real
// directory via node:fs (e.g. `readdirSync(dir, {withFileTypes:true})` → names, dirs
// suffixed `/`), apply `completion` to the buffer, and render `formatPathCandidates`
// below the input when `candidates.length > 1`.
//
// SECURITY: this never reads file CONTENTS and never executes a glob — the prefix is
// matched literally as a basename. Listing is the injected caller's job.

/** A directory listing for one path: entry names, directories suffixed with `/`. */
export interface DirListing {
  /** Entry names in `dir`. Directories carry a trailing `/`. */
  readonly entries: string[];
}

export interface CompletePathDeps {
  /** List `dir`; dir names suffixed `/`. MUST NOT throw — return empty on failure. */
  readonly listDir: (dir: string) => DirListing;
}

export interface PathSplit {
  /** The directory portion to list (what precedes the final separator). */
  readonly dir: string;
  /** The basename prefix being typed (what follows the final separator). */
  readonly prefix: string;
}

export interface PathCompletion {
  /** Matching entries in `dir` whose name starts with `prefix` (dirs suffixed `/`). */
  readonly candidates: string[];
  /** Text to fill the partial with, or null when nothing should change. */
  readonly completion: string | null;
}

/**
 * Split a partial path into the directory to list and the basename prefix.
 * Handles bare (`foo` → list `.`), `./foo`, `~/foo`, absolute `/a/b`, and a
 * trailing-separator path (`src/` → list `src`, empty prefix). The dir is
 * returned with its typed shape preserved (`~`, `./`, leading `/`) so the
 * caller can re-prefix completions; only the basename after the last `/` is
 * treated as the prefix.
 */
export function splitPathPartial(input: string): PathSplit {
  const slash = input.lastIndexOf("/");
  if (slash === -1) {
    // No separator: a bare token (`foo`, `~`, ``) lists the current directory.
    return { dir: ".", prefix: input };
  }
  // Keep the separator on the dir so `/` → dir `/`, `~/` → dir `~/`, `a/` → dir `a/`.
  const dir = input.slice(0, slash + 1);
  const prefix = input.slice(slash + 1);
  return { dir, prefix };
}

/** The longest common string prefix of all inputs (`""` when none / no overlap). */
export function commonPrefix(strings: string[]): string {
  if (strings.length === 0) return "";
  let prefix = strings[0]!;
  for (let i = 1; i < strings.length; i++) {
    const s = strings[i]!;
    let j = 0;
    const max = Math.min(prefix.length, s.length);
    while (j < max && prefix[j] === s[j]) j++;
    prefix = prefix.slice(0, j);
    if (prefix === "") break;
  }
  return prefix;
}

/**
 * Complete a partial path against an injected directory lister.
 * - candidates = entries in the partial's dir whose name starts with the prefix
 *   (directories already suffixed `/` by the lister).
 * - completion = the text to fill the WHOLE partial with: a single match fills
 *   its full name; multiple matches fill the longest shared prefix when it
 *   extends past what's typed; no extension (or no match) → null (no change).
 * A listDir failure surfaces as an empty listing → no matches → null.
 */
export function completePath(partial: string, deps: CompletePathDeps): PathCompletion {
  const { dir, prefix } = splitPathPartial(partial);
  const listing = safeList(deps.listDir, dir);
  const candidates = listing.entries.filter((name) => name.startsWith(prefix));
  if (candidates.length === 0) return { candidates: [], completion: null };

  const dirPart = dirPrefixOf(partial); // text before the basename (incl. trailing `/`)
  if (candidates.length === 1) {
    return { candidates, completion: dirPart + candidates[0]! };
  }
  const shared = commonPrefix(candidates);
  // Only fill when the shared prefix is longer than what's already typed.
  if (shared.length > prefix.length) {
    return { candidates, completion: dirPart + shared };
  }
  return { candidates, completion: null };
}

/** Compact list of completion candidates, one `▸ name` per line. */
export function formatPathCandidates(candidates: string[]): string {
  return candidates.map((c) => `▸ ${c}`).join("\n");
}

/** The portion of `partial` before the basename, including a trailing `/` if present. */
function dirPrefixOf(partial: string): string {
  const slash = partial.lastIndexOf("/");
  return slash === -1 ? "" : partial.slice(0, slash + 1);
}

/** Call the injected lister, converting any throw into an empty listing. */
function safeList(listDir: (dir: string) => DirListing, dir: string): DirListing {
  try {
    return listDir(dir);
  } catch {
    return { entries: [] };
  }
}
