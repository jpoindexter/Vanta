import {
  parseMarketplaceSource,
  mergeCatalogs,
  type MarketplacePlugin,
  type MergedCatalog,
} from "./marketplace-catalog.js";

// VANTA-PLUGIN-MARKETPLACE — aggregate a plugin CATALOG from multiple configured
// registry sources, merge + dedupe + locally cache it, and search it, so the
// operator can browse/find plugins to install ACROSS sources.
//
// LISTING != TRUSTING. A marketplace source is UNTRUSTED external input: every
// entry is validated (the name must be a safe plugin-name slug), a garbage source
// yields [] rather than poisoning the catalog, and a source fetch failure degrades
// to that source's cache-or-[] (the source is skipped, never throws). Browsing the
// catalog confers NO trust — installing a listed plugin still goes through the
// plugin trust/kernel gate (the `loader`/`assess()` path); the marketplace only
// tells the operator a plugin exists and where it came from.
//
// This module is PURE + injectable: parse/merge/search take plain data, and
// `fetchMarketplace` takes its per-source network + cache as injected deps, so it
// unit-tests with no real HTTP and no filesystem. The MIRROR of mcp/official-
// registry.ts (cache-first fetch, tolerant parse, never-throws) extended to the
// MULTI-SOURCE case: each source is fetched independently and the results merged.
// The catalog data model (types, schemas, parse, merge) lives in marketplace-catalog.ts.

export {
  parseMarketplaceSource,
  mergeCatalogs,
  type MarketplacePlugin,
  type MergedCatalog,
} from "./marketplace-catalog.js";

/** Maximum number of search matches returned, so a broad query can't dump the
 * whole catalog. */
export const MARKETPLACE_SEARCH_CAP = 20;

/** Rank tiers for a search match (higher surfaces first). */
const RANK_NAME_STARTS = 3;
const RANK_NAME_CONTAINS = 2;
const RANK_DESC_CONTAINS = 1;

/** Score a single plugin against a lowercased query, or 0 for no match. */
function scoreMatch(plugin: MarketplacePlugin, query: string): number {
  const name = plugin.name.toLowerCase();
  if (name.startsWith(query)) return RANK_NAME_STARTS;
  if (name.includes(query)) return RANK_NAME_CONTAINS;
  const desc = plugin.description?.toLowerCase() ?? "";
  if (desc.includes(query)) return RANK_DESC_CONTAINS;
  return 0;
}

/**
 * Search a merged catalog for `query`, returning ranked matches (best first):
 * a name that STARTS WITH the query outranks one that merely CONTAINS it, which
 * outranks a description-only match. Case-insensitive substring matching; ties
 * break by plugin name for a stable order; capped at `MARKETPLACE_SEARCH_CAP`.
 * Pure. An empty/blank query → [] (no implicit "list everything").
 */
export function searchMarketplace(
  catalog: readonly MarketplacePlugin[],
  query: string,
): MarketplacePlugin[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: Array<{ plugin: MarketplacePlugin; score: number }> = [];
  for (const plugin of catalog) {
    const score = scoreMatch(plugin, q);
    if (score > 0) scored.push({ plugin, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.plugin.name.localeCompare(b.plugin.name))
    .slice(0, MARKETPLACE_SEARCH_CAP)
    .map((s) => s.plugin);
}

/** Fetches one source's raw catalog JSON over the network (the documented
 * boundary — the only impure input). */
export type FetchJson = (sourceUrl: string) => Promise<string>;
/** Reads a source's cached catalog JSON, or null when no cache exists. */
export type CacheRead = (sourceUrl: string) => Promise<string | null>;
/** Writes a source's freshly-fetched catalog JSON to the cache (best-effort). */
export type CacheWrite = (sourceUrl: string, json: string) => Promise<void>;

/** Injected dependencies for {@link fetchMarketplace}. */
export type FetchMarketplaceDeps = {
  /** The configured source URLs. No sources → an empty catalog. */
  sources: readonly string[];
  /** The live per-source fetch. THE network boundary — the only impure input. */
  fetchJson: FetchJson;
  /** Optional per-source cache read (cache-first). */
  cacheRead?: CacheRead;
  /** Optional per-source cache write (refresh after a successful fetch). */
  cacheWrite?: CacheWrite;
};

/**
 * Resolve ONE source's plugins, cache-first. Reads the cache and returns it when
 * it parses to a non-empty list; otherwise fetches live, caches the raw JSON, and
 * returns the parsed entries. NEVER throws: a fetch failure falls back to the
 * cached entries (if any) or [] — the source is effectively SKIPPED, never
 * aborting the aggregate.
 */
async function resolveSource(
  source: string,
  deps: FetchMarketplaceDeps,
): Promise<MarketplacePlugin[]> {
  const cached = await readSourceCache(source, deps.cacheRead);
  if (cached.length > 0) return cached;
  try {
    const json = await deps.fetchJson(source);
    const parsed = parseMarketplaceSource(json, source);
    if (parsed.length > 0 && deps.cacheWrite) {
      await deps.cacheWrite(source, json).catch(() => {});
    }
    return parsed;
  } catch {
    return cached; // fetch failed → cached (possibly []), source skipped
  }
}

/** Read + parse one source's cache, swallowing any read/parse error to []. */
async function readSourceCache(
  source: string,
  cacheRead?: CacheRead,
): Promise<MarketplacePlugin[]> {
  if (!cacheRead) return [];
  try {
    const raw = await cacheRead(source);
    return raw ? parseMarketplaceSource(raw, source) : [];
  } catch {
    return [];
  }
}

/**
 * Aggregate the marketplace catalog across all configured sources, cache-first
 * per source, then merge + dedupe. NEVER throws: a single source's fetch failure
 * skips that source (its cache or []) while the others still merge — a flaky
 * source can't break browsing. No sources → an empty catalog. The live HTTP in
 * `fetchJson` is the documented boundary; everything else is pure given the deps.
 *
 * Live wiring is DEFERRED (mirror clarity-gate): a `vanta plugins browse` /
 * `vanta plugins search <q>` command would build `FetchMarketplaceDeps` from
 * settings (`sources` = the configured registry URLs, `fetchJson` = a real HTTP
 * GET, `cacheRead`/`cacheWrite` = `.vanta/plugin-marketplace/<hash>.json`), call
 * `fetchMarketplace` to get the catalog, then `searchMarketplace(catalog.plugins,
 * q)` for the query — and an install from a result STILL routes through the
 * plugin trust + kernel gate (listing != trusting).
 */
export async function fetchMarketplace(
  deps: FetchMarketplaceDeps,
): Promise<MergedCatalog> {
  const perSource = await Promise.all(
    deps.sources.map((source) => resolveSource(source, deps)),
  );
  return mergeCatalogs(perSource);
}
