import { ShellHookSchema, type ShellHook } from "./shell-hooks.js";

// VANTA-HOOK-FRONTMATTER — a skill (or agent) declares hooks in its YAML
// frontmatter under a `hooks:` key, using the same entry shape as
// `.vanta/hooks.json`. This module is PURE: it reads that key off a parsed
// frontmatter object, zod-validates each entry against the canonical hook
// schema, drops invalid entries (errors-as-values — never throws), and merges
// the survivors into an existing runtime hook set. No `hooks` key => no hooks.

/** A parsed frontmatter object may carry an arbitrary `hooks` value. */
type FrontmatterLike = Record<string, unknown> | null | undefined;

/**
 * Pull the raw `hooks` value off a parsed frontmatter object as an array of
 * candidate entries. Accepts two shapes (both mirror `.vanta/hooks.json`):
 *   - a flat array: `hooks: [ {…}, {…} ]`
 *   - an event-keyed map: `hooks: { PreToolUse: [ {…} ], Stop: [ {…} ] }`
 * Anything else (absent, scalar, null) yields an empty list.
 */
function rawHookEntries(meta: FrontmatterLike): unknown[] {
  if (meta === null || typeof meta !== "object") return [];
  const raw = (meta as Record<string, unknown>).hooks;
  if (Array.isArray(raw)) return raw;
  if (raw !== null && typeof raw === "object") {
    // Event-keyed map: flatten every event's array into one entry list.
    return Object.values(raw as Record<string, unknown>).flatMap((v) =>
      Array.isArray(v) ? v : [],
    );
  }
  return [];
}

/**
 * Extract + normalize frontmatter-declared hooks into a flat {@link ShellHook}
 * list. Each candidate is validated against the canonical hook schema; invalid
 * entries are dropped, valid ones kept. Pure; never throws.
 *
 * @param meta a parsed frontmatter object (e.g. a SKILL.md / agent header).
 * @returns the valid declared hooks; `[]` when no `hooks` key is present.
 */
export function extractFrontmatterHooks(meta: FrontmatterLike): ShellHook[] {
  const out: ShellHook[] = [];
  for (const entry of rawHookEntries(meta)) {
    const parsed = ShellHookSchema.safeParse(entry);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Stable structural identity for a hook, used to dedupe across hook sets. */
function hookKey(hook: ShellHook): string {
  const sorted = Object.keys(hook)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = (hook as Record<string, unknown>)[k];
      return acc;
    }, {});
  return JSON.stringify(sorted);
}

/**
 * Combine a base runtime hook set with frontmatter-declared hooks. `base` order
 * is preserved; declared hooks are appended, skipping any that are structurally
 * identical to a hook already in the combined set (idempotent re-declaration).
 * Pure; never throws.
 */
export function mergeFrontmatterHooks(
  base: ShellHook[],
  declared: ShellHook[],
): ShellHook[] {
  const seen = new Set<string>();
  const merged: ShellHook[] = [];
  for (const hook of [...base, ...declared]) {
    const key = hookKey(hook);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(hook);
  }
  return merged;
}
