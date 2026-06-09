import { resolve, sep } from "node:path";

/**
 * Resolve `target` against `root` and report whether it stays inside scope.
 * Mirrors the Rust kernel's `inside_scope` — defense in depth at the tool layer.
 */
export function resolveInScope(
  target: string,
  root: string,
): { ok: boolean; path: string } {
  const base = resolve(root);
  const abs = resolve(base, target);
  const inside = abs === base || abs.startsWith(base + sep);
  return { ok: inside, path: abs };
}
