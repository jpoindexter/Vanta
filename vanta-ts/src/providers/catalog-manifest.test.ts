import { describe, it, expect } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveCatalog, parseManifest, bundledManifest, diskCacheDeps,
  CATALOG_PRIMARY_URL, CATALOG_GITHUB_RAW, type CatalogManifest, type CachedManifest, type CatalogDeps,
} from "./catalog-manifest.js";

// EXT-MODEL-CATALOG-REMOTE — refresh with the full fallback chain; offline works.

const MANIFEST: CatalogManifest = {
  version: 1,
  providers: [{ id: "openai", label: "OpenAI", short: "openai", envVar: "OPENAI_API_KEY", defaultModel: "gpt-5", models: ["gpt-5", "gpt-5-mini"] }],
};

function deps(over: Partial<CatalogDeps> = {}): CatalogDeps {
  return {
    fetchJson: async () => null, // offline by default
    readCache: async () => null,
    writeCache: async () => {},
    now: 1_000_000,
    ...over,
  };
}

describe("parseManifest", () => {
  it("accepts a valid manifest and rejects junk / wrong version", () => {
    expect(parseManifest(MANIFEST)).toEqual(MANIFEST);
    expect(parseManifest({ version: 2, providers: [] })).toBeNull();
    expect(parseManifest({ providers: [{ id: "x" }] })).toBeNull();
    expect(parseManifest("nope")).toBeNull();
  });
});

describe("resolveCatalog fallback chain", () => {
  it("a fresh cache short-circuits the network", async () => {
    const cached: CachedManifest = { fetchedAt: 999_000, manifest: MANIFEST };
    let fetched = false;
    const r = await resolveCatalog(deps({ readCache: async () => cached, fetchJson: async () => { fetched = true; return null; }, ttlMs: 10_000 }));
    expect(r.source).toBe("cache-fresh");
    expect(fetched).toBe(false);
  });

  it("a stale cache triggers a refresh from the PRIMARY url and persists it", async () => {
    const cached: CachedManifest = { fetchedAt: 0, manifest: MANIFEST }; // way past TTL
    const writes: CachedManifest[] = [];
    const r = await resolveCatalog(deps({
      readCache: async () => cached,
      fetchJson: async (url) => (url === CATALOG_PRIMARY_URL ? MANIFEST : null),
      writeCache: async (c) => { writes.push(c); },
      ttlMs: 10_000,
    }));
    expect(r.source).toBe("primary");
    expect(writes[0]?.fetchedAt).toBe(1_000_000);
  });

  it("falls through to the GitHub raw mirror when the primary fails", async () => {
    const r = await resolveCatalog(deps({ fetchJson: async (url) => (url === CATALOG_GITHUB_RAW ? MANIFEST : null) }));
    expect(r.source).toBe("github");
  });

  it("falls back to a STALE cache when all network fails", async () => {
    const cached: CachedManifest = { fetchedAt: 0, manifest: MANIFEST };
    const r = await resolveCatalog(deps({ readCache: async () => cached, fetchJson: async () => null, ttlMs: 10_000 }));
    expect(r.source).toBe("cache-stale");
    expect(r.providers[0]?.id).toBe("openai");
  });

  it("falls back to the BUNDLED catalog when offline with no cache", async () => {
    const r = await resolveCatalog(deps({ fetchJson: async () => null, readCache: async () => null }));
    expect(r.source).toBe("bundled");
    expect(r.providers).toEqual(bundledManifest().providers);
    expect(r.providers.length).toBeGreaterThan(0);
  });

  it("ignores an invalid remote payload and keeps falling through", async () => {
    // primary returns junk → github returns valid.
    const r = await resolveCatalog(deps({ fetchJson: async (url) => (url === CATALOG_PRIMARY_URL ? { bad: true } : MANIFEST) }));
    expect(r.source).toBe("github");
  });
});

describe("diskCacheDeps (atomic cache)", () => {
  it("write then read round-trips; the temp file is renamed away", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-catalog-"));
    const path = join(dir, "model-catalog.json");
    const { readCache, writeCache } = diskCacheDeps(path);
    await writeCache({ fetchedAt: 1234, manifest: MANIFEST });
    const back = await readCache();
    expect(back?.fetchedAt).toBe(1234);
    expect(back?.manifest.providers[0]?.id).toBe("openai");
    // The final file is valid JSON (no half-write) and no .tmp sibling remains.
    const { readdir } = await import("node:fs/promises");
    expect((await readdir(dir)).some((f) => f.includes(".tmp"))).toBe(false);
    JSON.parse(await readFile(path, "utf8")); // parses cleanly
  });

  it("a corrupt/missing cache file reads as null", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-catalog-"));
    const { readCache, writeCache } = diskCacheDeps(join(dir, "c.json"));
    expect(await readCache()).toBeNull(); // missing
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(dir, "c.json"), "{broken", "utf8");
    expect(await readCache()).toBeNull(); // corrupt
    void writeCache;
  });
});
