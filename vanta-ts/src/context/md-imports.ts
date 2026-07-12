import { isAbsolute, resolve, dirname } from "node:path";

// VANTA-MD-IMPORTS — `@<path>` import syntax in VANTA.md / rules files.
// Pure, injectable resolver: each `@<path>` token in the text is replaced by
// the referenced file's (recursively resolved) contents. Relative paths resolve
// against `baseDir`; absolute paths are used as-is. Recursion is capped at
// `maxHops` hops; a path already on the current chain (cycle) or a missing file
// is skipped — the `@path` token is left in place. No throwing: the injected
// `readFile` returns null instead of rejecting on a missing/unreadable file.

/** Reads an absolute path. Returns null on missing/unreadable (errors-as-values). */
export type ReadFile = (absPath: string) => Promise<string | null>;

export type ResolveOpts = {
  /** Directory relative `@<path>` tokens resolve against. */
  baseDir: string;
  /** Max import hops before expansion stops. Default 4. */
  maxHops?: number;
  /** Absolute paths already on the current chain — used for cycle detection. */
  seen?: Set<string>;
  /** Current recursion depth (internal). */
  depth?: number;
  /** Evidence hook for documentation-router health. */
  onResolve?: (event: { kind: "loaded" | "missing" | "cycle"; path: string }) => void | Promise<void>;
};

/** Same path char class the @-context picker uses: words, `.`, `/`, `-`. */
const IMPORT_RE = /@([\w./\-]+)/g;

const DEFAULT_MAX_HOPS = 4;

/** Resolve one `@path` token to an absolute path against baseDir. */
function toAbsolute(path: string, baseDir: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(baseDir, path);
}

/**
 * Inline every `@<path>` import in `text`. Recursively resolves imports inside
 * imported files, with `baseDir` updated to each imported file's own directory
 * so its relative imports resolve correctly. Pure over the injected `readFile`.
 */
export async function resolveImports(text: string, readFile: ReadFile, opts: ResolveOpts): Promise<string> {
  const maxHops = opts.maxHops ?? DEFAULT_MAX_HOPS;
  const depth = opts.depth ?? 0;
  const seen = opts.seen ?? new Set<string>();
  // Stop expanding past the hop cap — leave deeper @path tokens untouched.
  if (depth >= maxHops) return text;

  const matches = [...text.matchAll(IMPORT_RE)];
  if (matches.length === 0) return text;

  const replacements = await Promise.all(
    matches.map((m) => expandOne(m[1]!, m[0]!, readFile, { baseDir: opts.baseDir, maxHops, seen, depth, onResolve: opts.onResolve })),
  );

  let out = "";
  let cursor = 0;
  matches.forEach((m, i) => {
    const start = m.index ?? 0;
    out += text.slice(cursor, start) + replacements[i]!;
    cursor = start + m[0]!.length;
  });
  return out + text.slice(cursor);
}

/** Expand a single `@path` token, or return the original token if it can't be inlined. */
async function expandOne(
  path: string,
  token: string,
  readFile: ReadFile,
  ctx: { baseDir: string; maxHops: number; seen: Set<string>; depth: number; onResolve?: ResolveOpts["onResolve"] },
): Promise<string> {
  const abs = toAbsolute(path, ctx.baseDir);
  if (ctx.seen.has(abs)) {
    await ctx.onResolve?.({ kind: "cycle", path: abs });
    return token;
  }
  const content = await readFile(abs);
  if (content === null) {
    await ctx.onResolve?.({ kind: "missing", path: abs });
    return token;
  }
  await ctx.onResolve?.({ kind: "loaded", path: abs });
  const nextSeen = new Set(ctx.seen).add(abs);
  return resolveImports(content, readFile, {
    baseDir: dirname(abs),
    maxHops: ctx.maxHops,
    seen: nextSeen,
    depth: ctx.depth + 1,
    onResolve: ctx.onResolve,
  });
}
