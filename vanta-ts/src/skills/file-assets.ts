/**
 * Skill companion files (bundled assets extracted to disk on first use).
 *
 * A skill dir is `~/.vanta/skills/<slug>/`. Alongside its `SKILL.md` a skill MAY
 * bundle companion files — scripts, templates, reference docs — so the skill body
 * can reference `./helper.py`, `./template.md`, etc. These resolvers decide which
 * companion files a skill dir has, which still need extracting (skip-if-present),
 * and perform a best-effort copy.
 *
 * Pure + injectable by design: every fs touch is a dependency passed in, so the
 * resolution and extraction PLAN are unit-tested with no real disk. A skill with
 * no companion files extracts nothing — current behavior is preserved.
 *
 * SECURITY: only plain file NAMES within the skill dir are ever extracted. Any
 * entry that is a path traversal (`..`), nested path (contains a separator), or
 * absolute path is rejected — extraction can never escape the destination dir.
 */

/** The skill body file itself is never a companion asset. */
const SKILL_FILE = "SKILL.md";

/**
 * True iff `name` is a single plain filename safe to extract into a skill dir:
 * no path separators, no `..`, not absolute, not `.`/`..`. Anything that could
 * resolve outside the skill dir is rejected (traversal-safe).
 */
export function isSafeAssetName(name: string): boolean {
  if (name.length === 0) return false;
  if (name === "." || name === "..") return false;
  if (name.includes("/") || name.includes("\\")) return false;
  // A bare drive-letter prefix ("C:foo") or leading colon could be coerced into
  // an absolute path on some platforms; a plain companion file never has one.
  if (name.includes(":")) return false;
  return true;
}

/**
 * The companion files of a skill dir: every entry EXCEPT `SKILL.md` itself,
 * filtered to traversal-safe plain names. `srcEntries` is an injected directory
 * listing (e.g. `readdir(dir)`), so this is pure. A dir with only `SKILL.md`
 * (or empty) returns `[]`.
 */
export function listSkillAssets(srcEntries: readonly string[]): string[] {
  return srcEntries.filter(
    (name) => name !== SKILL_FILE && isSafeAssetName(name),
  );
}

/**
 * The assets to extract: the companion files of the source dir that are NOT
 * already present in the destination dir (skip-if-present → idempotent re-run
 * extracts nothing). Both listings are injected, so this is pure.
 */
export function planAssetExtraction(
  srcEntries: readonly string[],
  destExisting: readonly string[],
): string[] {
  const present = new Set(destExisting);
  return listSkillAssets(srcEntries).filter((name) => !present.has(name));
}

/** Injected fs surface for {@link extractSkillAssets}. */
export type ExtractDeps = {
  /** Names in the source skill dir (e.g. `await readdir(srcDir)`). */
  listSrc: () => Promise<readonly string[]>;
  /** Names already in the destination skill dir. */
  listDest: () => Promise<readonly string[]>;
  /** Copy one companion file from src→dest by NAME. Throws on failure. */
  copy: (name: string) => Promise<void>;
};

/**
 * Extract a skill's companion files into its on-disk dir. Resolves the planned
 * set (traversal-safe, skip-if-present) and copies each via the injected `copy`.
 *
 * Best-effort: a single copy failure is swallowed (that asset is skipped, never
 * extracted), and listing failures degrade to "nothing to do" — this function
 * NEVER throws. Returns the names actually extracted (so a no-companion-files
 * skill returns `[]` and nothing is copied).
 */
export async function extractSkillAssets(deps: ExtractDeps): Promise<string[]> {
  let srcEntries: readonly string[];
  let destExisting: readonly string[];
  try {
    srcEntries = await deps.listSrc();
  } catch {
    return []; // unreadable source dir → nothing to extract
  }
  try {
    destExisting = await deps.listDest();
  } catch {
    destExisting = []; // missing dest dir → treat all assets as absent
  }

  const planned = planAssetExtraction(srcEntries, destExisting);
  const extracted: string[] = [];
  for (const name of planned) {
    try {
      await deps.copy(name);
      extracted.push(name);
    } catch {
      // best-effort: skip this asset, keep going, never throw
    }
  }
  return extracted;
}
