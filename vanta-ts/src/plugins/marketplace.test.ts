import { describe, it, expect } from "vitest";
import {
  parseMarketplaceSource,
  mergeCatalogs,
  searchMarketplace,
  fetchMarketplace,
  MARKETPLACE_SEARCH_CAP,
  type MarketplacePlugin,
  type FetchMarketplaceDeps,
} from "./marketplace.js";

const SRC_A = "https://a.example/catalog.json";
const SRC_B = "https://b.example/catalog.json";

function plugin(
  name: string,
  source: string,
  extra: Partial<MarketplacePlugin> = {},
): MarketplacePlugin {
  return { name, source, ...extra };
}

describe("parseMarketplaceSource", () => {
  it("parses a bare-array catalog and stamps each plugin with its source", () => {
    const json = JSON.stringify([
      { name: "alpha", description: "the alpha tool", version: "1.0.0" },
      { name: "beta", installRef: "npm:beta" },
    ]);
    const out = parseMarketplaceSource(json, SRC_A);
    expect(out).toEqual([
      {
        name: "alpha",
        source: SRC_A,
        description: "the alpha tool",
        version: "1.0.0",
      },
      { name: "beta", source: SRC_A, installRef: "npm:beta" },
    ]);
  });

  it("parses the {plugins:[]} wrapper shape", () => {
    const json = JSON.stringify({ plugins: [{ name: "gamma" }] });
    const out = parseMarketplaceSource(json, SRC_A);
    expect(out).toEqual([{ name: "gamma", source: SRC_A }]);
  });

  it("returns [] on invalid JSON (never throws)", () => {
    expect(parseMarketplaceSource("{not json", SRC_A)).toEqual([]);
  });

  it("returns [] on a non-array / non-{plugins} shape", () => {
    expect(parseMarketplaceSource(JSON.stringify({ foo: 1 }), SRC_A)).toEqual([]);
    expect(parseMarketplaceSource(JSON.stringify("a string"), SRC_A)).toEqual([]);
    expect(parseMarketplaceSource(JSON.stringify(42), SRC_A)).toEqual([]);
  });

  it("drops individual malformed/nameless rows but keeps valid ones", () => {
    const json = JSON.stringify([
      { name: "good" },
      { description: "no name" },
      42,
      null,
      { name: "alsoGood", version: "2.0.0" },
    ]);
    const out = parseMarketplaceSource(json, SRC_A);
    expect(out.map((p) => p.name)).toEqual(["good", "alsoGood"]);
  });

  it("rejects an unsafe plugin name (untrusted source — listing != trusting)", () => {
    const json = JSON.stringify([
      { name: "rm -rf /" },
      { name: "../etc/passwd" },
      { name: "a name with spaces" },
      { name: "safe-one" },
    ]);
    const out = parseMarketplaceSource(json, SRC_A);
    expect(out.map((p) => p.name)).toEqual(["safe-one"]);
  });

  it("coerces blank optional fields to undefined", () => {
    const json = JSON.stringify([
      { name: "alpha", description: "  ", version: "" },
    ]);
    const out = parseMarketplaceSource(json, SRC_A);
    expect(out[0]).toEqual({ name: "alpha", source: SRC_A });
  });
});

describe("mergeCatalogs", () => {
  it("dedupes by name (first source wins) and counts clashes", () => {
    const a = [plugin("alpha", SRC_A), plugin("beta", SRC_A)];
    const b = [plugin("beta", SRC_B), plugin("gamma", SRC_B)];
    const merged = mergeCatalogs([a, b]);
    expect(merged.plugins.map((p) => p.name)).toEqual(["alpha", "beta", "gamma"]);
    // beta kept from the FIRST source.
    expect(merged.plugins.find((p) => p.name === "beta")?.source).toBe(SRC_A);
    expect(merged.clashes).toBe(1);
  });

  it("dedupes case-insensitively", () => {
    const a = [plugin("Alpha", SRC_A)];
    const b = [plugin("alpha", SRC_B)];
    const merged = mergeCatalogs([a, b]);
    expect(merged.plugins).toHaveLength(1);
    expect(merged.plugins[0]?.source).toBe(SRC_A);
    expect(merged.clashes).toBe(1);
  });

  it("no catalogs → empty catalog, zero clashes", () => {
    expect(mergeCatalogs([])).toEqual({ plugins: [], clashes: 0 });
  });

  it("all-empty catalogs → empty catalog, zero clashes", () => {
    expect(mergeCatalogs([[], []])).toEqual({ plugins: [], clashes: 0 });
  });
});

describe("searchMarketplace", () => {
  const catalog: MarketplacePlugin[] = [
    plugin("git-helper", SRC_A, { description: "manage repos" }),
    plugin("ripgrep", SRC_A, { description: "a fast git-aware search tool" }),
    plugin("alpha-git", SRC_A, { description: "unrelated" }),
  ];

  it("ranks name-startsWith > name-contains > description-contains", () => {
    const out = searchMarketplace(catalog, "git");
    expect(out.map((p) => p.name)).toEqual([
      "git-helper", // name starts with "git"
      "alpha-git", // name contains "git"
      "ripgrep", // only the description contains "git"
    ]);
  });

  it("is case-insensitive", () => {
    expect(searchMarketplace(catalog, "GIT").map((p) => p.name)).toContain(
      "git-helper",
    );
  });

  it("empty/blank query → [] (no implicit list-everything)", () => {
    expect(searchMarketplace(catalog, "")).toEqual([]);
    expect(searchMarketplace(catalog, "   ")).toEqual([]);
  });

  it("no match → []", () => {
    expect(searchMarketplace(catalog, "zzznope")).toEqual([]);
  });

  it("caps the number of matches", () => {
    const many: MarketplacePlugin[] = Array.from({ length: 50 }, (_, i) =>
      plugin(`tool-${String(i).padStart(2, "0")}`, SRC_A),
    );
    const out = searchMarketplace(many, "tool");
    expect(out).toHaveLength(MARKETPLACE_SEARCH_CAP);
  });
});

describe("fetchMarketplace", () => {
  function deps(over: Partial<FetchMarketplaceDeps>): FetchMarketplaceDeps {
    return {
      sources: [SRC_A, SRC_B],
      fetchJson: async () => "[]",
      ...over,
    };
  }

  it("no sources → empty catalog", async () => {
    const merged = await fetchMarketplace(deps({ sources: [] }));
    expect(merged).toEqual({ plugins: [], clashes: 0 });
  });

  it("fetches each source live and merges + dedupes them", async () => {
    const bySource: Record<string, string> = {
      [SRC_A]: JSON.stringify([{ name: "alpha" }, { name: "shared" }]),
      [SRC_B]: JSON.stringify([{ name: "shared" }, { name: "beta" }]),
    };
    const merged = await fetchMarketplace(
      deps({ fetchJson: async (s) => bySource[s] ?? "[]" }),
    );
    expect(merged.plugins.map((p) => p.name)).toEqual([
      "alpha",
      "shared",
      "beta",
    ]);
    expect(merged.plugins.find((p) => p.name === "shared")?.source).toBe(SRC_A);
    expect(merged.clashes).toBe(1);
  });

  it("is cache-first per source — a cached source is not fetched live", async () => {
    let fetched = 0;
    const merged = await fetchMarketplace(
      deps({
        sources: [SRC_A],
        cacheRead: async () => JSON.stringify([{ name: "cached-one" }]),
        fetchJson: async () => {
          fetched += 1;
          return JSON.stringify([{ name: "live-one" }]);
        },
      }),
    );
    expect(fetched).toBe(0);
    expect(merged.plugins.map((p) => p.name)).toEqual(["cached-one"]);
  });

  it("writes the cache after a successful live fetch", async () => {
    const writes: Array<{ source: string; json: string }> = [];
    await fetchMarketplace(
      deps({
        sources: [SRC_A],
        cacheRead: async () => null,
        fetchJson: async () => JSON.stringify([{ name: "fresh" }]),
        cacheWrite: async (source, json) => {
          writes.push({ source, json });
        },
      }),
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]?.source).toBe(SRC_A);
  });

  it("a failing source is SKIPPED — the other sources still merge (never throws)", async () => {
    const merged = await fetchMarketplace(
      deps({
        fetchJson: async (s) => {
          if (s === SRC_A) throw new Error("network down");
          return JSON.stringify([{ name: "from-b" }]);
        },
      }),
    );
    expect(merged.plugins.map((p) => p.name)).toEqual(["from-b"]);
    expect(merged.clashes).toBe(0);
  });

  it("a failing source falls back to its cache when present", async () => {
    const merged = await fetchMarketplace(
      deps({
        sources: [SRC_A],
        cacheRead: async () => JSON.stringify([{ name: "stale-but-there" }]),
        fetchJson: async () => {
          throw new Error("boom");
        },
      }),
    );
    // cache-first already short-circuits, but assert the catalog is intact.
    expect(merged.plugins.map((p) => p.name)).toEqual(["stale-but-there"]);
  });

  it("all sources failing with no cache → empty catalog, never throws", async () => {
    const merged = await fetchMarketplace(
      deps({
        fetchJson: async () => {
          throw new Error("all down");
        },
      }),
    );
    expect(merged).toEqual({ plugins: [], clashes: 0 });
  });
});
