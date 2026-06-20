// VANTA-AUTO-UPDATER — pure version-check core.
//
// Compares the running version against an injected "latest" source using a
// minimal semver compare, and surfaces a one-line "update available" notice.
// Everything here is pure + injectable: `checkForUpdate` takes a `fetchLatest`
// dep, so the live network fetch is the caller's boundary (NOT auto-run here).
// A fetch failure degrades to "no update" rather than throwing — a network
// blip must never produce a false "update available" claim.

/** Parsed numeric semver triple. Pre-release/build suffixes are stripped. */
type SemverParts = { major: number; minor: number; patch: number };

/**
 * Parse "x.y.z" (with an optional leading `v` and a stripped pre-release/build
 * suffix) into numeric parts. Malformed segments fall back to 0 so comparison
 * stays total and never throws.
 */
function parseSemver(raw: string): SemverParts {
  const cleaned = raw.trim().replace(/^v/i, "");
  // Strip the first pre-release (`-`) or build (`+`) suffix: 1.2.3-rc.1 → 1.2.3
  const core = cleaned.split(/[-+]/, 1)[0] ?? "";
  const [major, minor, patch] = core.split(".");
  return { major: toInt(major), minor: toInt(minor), patch: toInt(patch) };
}

function toInt(seg: string | undefined): number {
  const n = Number.parseInt(seg ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Compare two semver strings numerically by major→minor→patch.
 * Returns -1 if a < b, 0 if equal, 1 if a > b. Pre-release suffixes are
 * stripped (simple compare; pre-release ordering is out of scope). Malformed
 * input compares as 0 in the affected segment.
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (const key of ["major", "minor", "patch"] as const) {
    if (pa[key] < pb[key]) return -1;
    if (pa[key] > pb[key]) return 1;
  }
  return 0;
}

/** True only when `latest` is strictly newer than `current`. */
export function isUpdateAvailable(current: string, latest: string): boolean {
  return compareSemver(current, latest) < 0;
}

/** One-line "update available" notice. Pure — caller decides where to print. */
export function buildUpdateNotice(current: string, latest: string): string {
  return `Update available: vanta ${current} → ${latest} (run \`vanta update\`)`;
}

/** Injected dependencies for {@link checkForUpdate}. */
export type CheckForUpdateDeps = {
  /** The running version (e.g. read from package.json by the caller). */
  currentVersion: string;
  /**
   * Resolves the latest published version string, or null when unknown.
   * The live network fetch lives HERE, injected by the caller — this module
   * never reaches the network. A thrown error or null → no update surfaced.
   */
  fetchLatest: () => Promise<string | null>;
};

/** Result of an update check. `notice` is present only when an update exists. */
export type UpdateCheck = {
  available: boolean;
  latest?: string;
  notice?: string;
};

/**
 * Compare the running version against the injected latest source.
 * A fetch failure (throw or null) degrades silently to `{available:false}` so
 * a transient network problem never yields a false "update available".
 */
export async function checkForUpdate(deps: CheckForUpdateDeps): Promise<UpdateCheck> {
  let latest: string | null;
  try {
    latest = await deps.fetchLatest();
  } catch {
    return { available: false };
  }
  if (!latest) return { available: false };
  if (!isUpdateAvailable(deps.currentVersion, latest)) {
    return { available: false, latest };
  }
  return {
    available: true,
    latest,
    notice: buildUpdateNotice(deps.currentVersion, latest),
  };
}
