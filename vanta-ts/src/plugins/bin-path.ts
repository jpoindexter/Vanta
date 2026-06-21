// VANTA-PLUGIN-BIN-EXEC — make an enabled plugin's bundled `bin/` executables
// callable by name from the shell tool. PURE + injectable: this module only
// RESOLVES which plugin bin dirs exist and COMPOSES the PATH overlay — it does
// no real fs (the `exists` probe is injected) and no spawning.
//
// SECURITY: a plugin may only expose its OWN `bin/` dir. The bin dir is `join`ed
// under the plugin dir and re-validated to stay inside it (no `..`/absolute
// escape), so an enabled plugin can never inject an arbitrary dir onto PATH.
// PATH exposure is NOT a privilege escalation: every command run with the
// augmented PATH is still routed through the kernel `assess()` gate — a plugin
// helper on PATH is invocable, never auto-trusted.
//
// Wiring (NOT done this round, named for clarity): the live merge point is
// `tools/shell-cmd.ts childRunOpts` (the same spot VANTA-SESSION-ENV's
// `applySessionEnv` merges) — overlay `pluginPathEnv(binDirs, childEnv)` onto
// the child env there so a plugin's CLI helper resolves by name in the spawn.

import { join, resolve, delimiter } from "node:path";

/** Injected fs probe — true when `path` exists. Keeps this module fs-free/testable. */
export type BinPathDeps = { exists: (path: string) => boolean };

/** A `{PATH}` overlay merging plugin bins ahead of the current PATH (or `{}`). */
export type PluginPathEnv = Readonly<{ PATH: string }> | Readonly<Record<string, never>>;

/**
 * The `<pluginDir>/bin` dirs that EXIST, for the given enabled-plugin dirs.
 * Each candidate is `join`ed under its plugin dir then re-validated to stay
 * inside it (defense against a `..`/absolute plugin dir escaping the join), so
 * only a plugin's own in-tree bin dir is ever returned. Non-existent bin dirs
 * are dropped. No plugin dirs → empty list.
 */
export function resolvePluginBinDirs(pluginDirs: readonly string[], deps: BinPathDeps): string[] {
  const out: string[] = [];
  for (const pluginDir of pluginDirs) {
    const binDir = join(pluginDir, "bin");
    if (!isInside(binDir, pluginDir)) continue; // can't happen via "bin", but enforce the invariant
    if (!deps.exists(binDir)) continue;
    out.push(binDir);
  }
  return out;
}

/**
 * The PATH string with `binDirs` prepended to `basePath`. Empty entries are
 * dropped, duplicates removed (first occurrence wins), and entries are joined
 * with the path delimiter (`sep`, default the OS `path.delimiter`). No binDirs
 * and an empty basePath → "".
 */
export function buildPluginPath(binDirs: readonly string[], basePath: string, sep: string = delimiter): string {
  const baseEntries = basePath === "" ? [] : basePath.split(sep);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const entry of [...binDirs, ...baseEntries]) {
    if (entry === "" || seen.has(entry)) continue;
    seen.add(entry);
    merged.push(entry);
  }
  return merged.join(sep);
}

/**
 * A `{PATH}` overlay merging the plugin bins ahead of the current PATH (read
 * from `env.PATH`). NO binDirs → returns `{}` so the child env is UNCHANGED
 * (byte-identical spawn) — mirrors `applySessionEnv`'s empty-input contract.
 */
export function pluginPathEnv(binDirs: readonly string[], env: NodeJS.ProcessEnv): PluginPathEnv {
  if (binDirs.length === 0) return {};
  return { PATH: buildPluginPath(binDirs, env.PATH ?? "") };
}

/** True when `child` is `dir` itself or nested inside it (no `..`/absolute escape). */
function isInside(child: string, dir: string): boolean {
  const base = resolve(dir);
  const target = resolve(child);
  return target === base || target.startsWith(base + "/");
}
