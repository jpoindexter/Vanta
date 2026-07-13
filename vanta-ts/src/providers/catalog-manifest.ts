import { z } from "zod";
import { PROVIDER_CATALOG, type ProviderEntry } from "./catalog.js";

// EXT-MODEL-CATALOG-REMOTE — refresh the model catalog from a remote JSON
// manifest so adding models doesn't need a release. Fallback chain, in order:
//   fresh disk cache (within TTL) → primary URL → raw-GitHub mirror → STALE
//   cache → bundled PROVIDER_CATALOG. A refresh atomically rewrites the cache
//   (temp + rename) and works fully offline from stale/bundled. Pure over
//   injected fetch + fs seams; the bundled catalog is the always-available floor.

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6h
export const CATALOG_PRIMARY_URL = "https://vanta-docs.pages.dev/model-catalog.json";
export const CATALOG_GITHUB_RAW = "https://raw.githubusercontent.com/jpoindexter/Vanta/main/docs/model-catalog.json";

// A remote entry is a permissive subset — we validate the shape but tolerate
// extra fields, and only accept an array of entries with the required keys.
const RemoteEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  short: z.string().min(1),
  envVar: z.string().nullable(),
  defaultModel: z.string().min(1),
  models: z.array(z.string()),
}).passthrough();
const ManifestSchema = z.object({ version: z.literal(1), providers: z.array(RemoteEntrySchema).min(1) });
export type CatalogManifest = z.infer<typeof ManifestSchema>;

/** Parse + validate a manifest payload; null on any shape mismatch. Pure. */
export function parseManifest(payload: unknown): CatalogManifest | null {
  const parsed = ManifestSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export type CachedManifest = { fetchedAt: number; manifest: CatalogManifest };
export type CatalogSource = "cache-fresh" | "primary" | "github" | "cache-stale" | "bundled";
export type CatalogResult = { providers: ProviderEntry[]; source: CatalogSource };

/** The bundled floor as a manifest (always valid, never network). Pure. */
export function bundledManifest(): CatalogManifest {
  return { version: 1, providers: PROVIDER_CATALOG };
}

/** Live disk-cache adapter: atomic write (temp + rename), tolerant read. */
export function diskCacheDeps(cachePath: string): Pick<CatalogDeps, "readCache" | "writeCache"> {
  return {
    readCache: async () => {
      try {
        const { readFile } = await import("node:fs/promises");
        const raw: unknown = JSON.parse(await readFile(cachePath, "utf8"));
        const r = raw as { fetchedAt?: unknown; manifest?: unknown };
        const manifest = parseManifest(r.manifest);
        return manifest && typeof r.fetchedAt === "number" ? { fetchedAt: r.fetchedAt, manifest } : null;
      } catch {
        return null;
      }
    },
    writeCache: async (cached) => {
      const { writeFile, rename, mkdir } = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      await mkdir(dirname(cachePath), { recursive: true });
      const tmp = `${cachePath}.tmp-${cached.fetchedAt}`;
      await writeFile(tmp, `${JSON.stringify(cached, null, 2)}\n`, "utf8");
      await rename(tmp, cachePath); // atomic swap — a reader never sees a half-written file
    },
  };
}

export type CatalogDeps = {
  /** Fetch a URL → parsed JSON, or null on any failure (never throws). */
  fetchJson: (url: string) => Promise<unknown>;
  /** Read the cached manifest, or null when absent/corrupt. */
  readCache: () => Promise<CachedManifest | null>;
  /** Atomically persist a freshly-fetched manifest (temp + rename). */
  writeCache: (cached: CachedManifest) => Promise<void>;
  now: number;
  ttlMs?: number;
  /** URL order to try (defaults to primary → github). */
  urls?: string[];
};

/** Try each URL in order; first one that parses to a valid manifest wins. Pure over fetch. */
async function fetchFirstValid(urls: string[], fetchJson: CatalogDeps["fetchJson"]): Promise<{ manifest: CatalogManifest; url: string } | null> {
  for (const url of urls) {
    const manifest = parseManifest(await fetchJson(url).catch(() => null));
    if (manifest) return { manifest, url };
  }
  return null;
}

/**
 * Resolve the model catalog through the full fallback chain. A fresh cache
 * short-circuits the network; otherwise refresh from primary → github, persist
 * on success, and fall back to a stale cache then the bundled floor when the
 * network is unavailable. Never throws — always returns a usable catalog.
 */
export async function resolveCatalog(deps: CatalogDeps): Promise<CatalogResult> {
  const ttl = deps.ttlMs ?? DEFAULT_TTL_MS;
  const urls = deps.urls ?? [CATALOG_PRIMARY_URL, CATALOG_GITHUB_RAW];
  const cached = await deps.readCache().catch(() => null);

  if (cached && deps.now - cached.fetchedAt < ttl) {
    return { providers: cached.manifest.providers, source: "cache-fresh" };
  }

  const fetched = await fetchFirstValid(urls, deps.fetchJson);
  if (fetched) {
    await deps.writeCache({ fetchedAt: deps.now, manifest: fetched.manifest }).catch(() => {});
    return { providers: fetched.manifest.providers, source: fetched.url === urls[0] ? "primary" : "github" };
  }

  if (cached) return { providers: cached.manifest.providers, source: "cache-stale" };
  return { providers: bundledManifest().providers, source: "bundled" };
}
