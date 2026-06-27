import { z } from "zod";
import { isSafePluginName } from "../hints/plugin-hints.js";

// The plugin-marketplace CATALOG data model: the validated entry shape, the
// tolerant source schemas, and the pure parse/merge functions over plain data
// (extracted from marketplace.ts for the file size gate). LISTING != TRUSTING:
// a source is UNTRUSTED external input, so every entry's name must be a safe
// plugin-name slug and a garbage source yields [] rather than poisoning the
// catalog. No I/O lives here — fetch/aggregation stays in marketplace.ts.

/** One plugin as it appears in the aggregated marketplace catalog. */
export type MarketplacePlugin = {
  /** Plugin name — a safe slug; the dedupe key across sources. */
  name: string;
  /** Human-facing description, when the source provides one. */
  description?: string;
  /** Available version string, when the source provides one. */
  version?: string;
  /** Which source URL this entry came from (stamped at parse time). */
  source: string;
  /** Install reference (e.g. package/git ref), when the source provides one. */
  installRef?: string;
};

// An optional string that coerces an empty/blank value to undefined, so a
// present-but-blank field doesn't reject the whole row.
const optStr = z
  .string()
  .optional()
  .transform((s) => (s && s.trim() ? s : undefined));

// Tolerant entry schema: name is required AND must be a safe plugin-name slug
// (untrusted source → reject metachars/paths/spaces), the rest are optional
// strings. Unknown fields are stripped. A non-object, nameless, or unsafe-named
// row is rejected and dropped rather than poisoning the catalog.
const EntrySchema = z
  .object({
    name: z.string().refine(isSafePluginName),
    description: optStr,
    version: optStr,
    installRef: optStr,
  })
  .transform((e) => ({
    name: e.name,
    description: e.description,
    version: e.version,
    installRef: e.installRef,
  }));

// A source's catalog JSON may be a bare array of entries or an object with a
// `plugins` array (the two shapes a real catalog ships). Anything else → no
// entries.
const CatalogSchema = z.union([
  z.array(z.unknown()),
  z.object({ plugins: z.array(z.unknown()) }).transform((o) => o.plugins),
]);

/** The result of merging multiple source catalogs: the deduped plugins plus how
 * many name clashes were resolved (first source wins). */
export type MergedCatalog = {
  plugins: MarketplacePlugin[];
  /** Number of dropped entries that clashed on an already-seen name. */
  clashes: number;
};

/**
 * Parse one source's catalog JSON into validated plugins, each stamped with its
 * `sourceUrl`. Tolerant: invalid JSON, a non-array / non-`{plugins:[]}` shape, or
 * individual malformed/unsafe-named rows all yield an empty list / are dropped —
 * NEVER throws. The source is untrusted, so a single bad row can't corrupt the
 * catalog and an unsafe name (metachars/path/space) can never enter it.
 */
export function parseMarketplaceSource(
  json: string,
  sourceUrl: string,
): MarketplacePlugin[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  const rows = CatalogSchema.safeParse(raw);
  if (!rows.success) return [];
  const out: MarketplacePlugin[] = [];
  for (const row of rows.data) {
    const parsed = EntrySchema.safeParse(row);
    if (!parsed.success) continue;
    const e = parsed.data;
    out.push({
      name: e.name,
      source: sourceUrl,
      ...(e.description ? { description: e.description } : {}),
      ...(e.version ? { version: e.version } : {}),
      ...(e.installRef ? { installRef: e.installRef } : {}),
    });
  }
  return out;
}

/**
 * Merge multiple source catalogs into one deduped catalog. Dedupe is BY PLUGIN
 * NAME (case-insensitive), FIRST SOURCE WINS: the earliest catalog/entry for a
 * name is kept; later entries with that name are dropped and counted as clashes.
 * Source order in `catalogs` is therefore the precedence order. Pure — no I/O.
 * No catalogs (or all empty) → an empty catalog with zero clashes.
 */
export function mergeCatalogs(
  catalogs: readonly MarketplacePlugin[][],
): MergedCatalog {
  const seen = new Map<string, MarketplacePlugin>();
  let clashes = 0;
  for (const catalog of catalogs) {
    for (const plugin of catalog) {
      const key = plugin.name.toLowerCase();
      if (seen.has(key)) {
        clashes += 1;
        continue;
      }
      seen.set(key, plugin);
    }
  }
  return { plugins: [...seen.values()], clashes };
}
