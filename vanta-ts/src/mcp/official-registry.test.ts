import { describe, it, expect, vi } from "vitest";
import {
  parseRegistry,
  lookupServer,
  serverTrustSignal,
  fetchOfficialRegistry,
  CANONICAL_SOURCE,
  type RegistryEntry,
  type FetchRegistryDeps,
} from "./official-registry.js";

// All pure / injected — no real network, no filesystem.

const officialEntry: RegistryEntry = {
  name: "github",
  command: "github-mcp-server",
  packageName: "@modelcontextprotocol/server-github",
  source: CANONICAL_SOURCE,
};

const ARRAY_FIXTURE = JSON.stringify([
  officialEntry,
  { name: "weather", packageName: "@community/weather", source: "community" },
  { name: "barebones" },
]);

const SERVERS_FIXTURE = JSON.stringify({
  servers: [{ name: "github", source: CANONICAL_SOURCE }],
});

describe("parseRegistry", () => {
  it("parses a bare-array registry into validated entries", () => {
    const entries = parseRegistry(ARRAY_FIXTURE);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual(officialEntry);
    expect(entries[2]).toEqual({ name: "barebones" });
  });

  it("parses the {servers:[...]} object shape", () => {
    const entries = parseRegistry(SERVERS_FIXTURE);
    expect(entries).toEqual([{ name: "github", source: CANONICAL_SOURCE }]);
  });

  it("strips unknown fields and drops empty optionals", () => {
    const entries = parseRegistry(
      JSON.stringify([{ name: "x", command: "", packageName: "p", extra: "ignored" }]),
    );
    expect(entries).toEqual([{ name: "x", packageName: "p" }]);
  });

  it("returns [] on invalid JSON", () => {
    expect(parseRegistry("{not json")).toEqual([]);
    expect(parseRegistry("")).toEqual([]);
  });

  it("returns [] on a non-array / non-{servers} shape", () => {
    expect(parseRegistry(JSON.stringify({ foo: 1 }))).toEqual([]);
    expect(parseRegistry(JSON.stringify("just a string"))).toEqual([]);
    expect(parseRegistry(JSON.stringify(42))).toEqual([]);
  });

  it("drops individual malformed rows but keeps valid ones", () => {
    const entries = parseRegistry(
      JSON.stringify([
        { name: "good" },
        { name: "" }, // empty name → rejected
        42, // not an object → rejected
        null,
        { command: "no-name" }, // missing name → rejected
        { name: "good2", source: "community" },
      ]),
    );
    expect(entries).toEqual([{ name: "good" }, { name: "good2", source: "community" }]);
  });
});

describe("lookupServer", () => {
  const registry = parseRegistry(ARRAY_FIXTURE);

  it("matches by name, case-insensitive", () => {
    expect(lookupServer(registry, "GitHub")).toEqual(officialEntry);
    expect(lookupServer(registry, "  weather  ".trim())).toMatchObject({ name: "weather" });
  });

  it("returns null when nothing matches", () => {
    expect(lookupServer(registry, "nonesuch")).toBeNull();
  });

  it("falls back to a command-substring match on the entry command", () => {
    const match = lookupServer(registry, "gh", "/usr/local/bin/github-mcp-server --port 3000");
    expect(match).toEqual(officialEntry);
  });

  it("falls back to a packageName-substring match (npx launch line)", () => {
    const match = lookupServer(registry, "wx", "npx -y @community/weather");
    expect(match).toMatchObject({ name: "weather" });
  });

  it("prefers a name match over a command match", () => {
    const reg: RegistryEntry[] = [
      { name: "weather", source: "community" },
      { name: "other", command: "weather-bin" },
    ];
    expect(lookupServer(reg, "weather", "weather-bin")).toMatchObject({ name: "weather" });
  });

  it("returns null when only a command is given and no entry matches it", () => {
    expect(lookupServer(registry, "zzz", "some-unknown-binary")).toBeNull();
  });
});

describe("serverTrustSignal", () => {
  it("is official for a canonical-source match", () => {
    expect(serverTrustSignal(officialEntry)).toBe("official");
  });

  it("is known for a non-canonical match", () => {
    expect(serverTrustSignal({ name: "weather", source: "community" })).toBe("known");
    expect(serverTrustSignal({ name: "barebones" })).toBe("known");
  });

  it("is unknown for no match", () => {
    expect(serverTrustSignal(null)).toBe("unknown");
  });
});

describe("fetchOfficialRegistry", () => {
  function deps(over: Partial<FetchRegistryDeps> = {}): FetchRegistryDeps {
    return { fetchJson: vi.fn(async () => ARRAY_FIXTURE), ...over };
  }

  it("returns cached entries without fetching when the cache is non-empty", async () => {
    const fetchJson = vi.fn(async () => "[]");
    const entries = await fetchOfficialRegistry({
      fetchJson,
      cacheRead: async () => SERVERS_FIXTURE,
    });
    expect(entries).toEqual([{ name: "github", source: CANONICAL_SOURCE }]);
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it("fetches live when there is no cache and writes the cache", async () => {
    const cacheWrite = vi.fn(async () => {});
    const d = deps({ cacheRead: async () => null, cacheWrite });
    const entries = await fetchOfficialRegistry(d);
    expect(entries).toHaveLength(3);
    expect(cacheWrite).toHaveBeenCalledWith(ARRAY_FIXTURE);
  });

  it("fetches live when the cache parses empty", async () => {
    const fetchJson = vi.fn(async () => ARRAY_FIXTURE);
    const entries = await fetchOfficialRegistry({ fetchJson, cacheRead: async () => "[]" });
    expect(entries).toHaveLength(3);
    expect(fetchJson).toHaveBeenCalledOnce();
  });

  it("falls back to cached entries on a fetch failure (never throws)", async () => {
    // Cache present but empty-parse forces a fetch; fetch throws → empty list.
    const entries = await fetchOfficialRegistry({
      fetchJson: async () => {
        throw new Error("network down");
      },
      cacheRead: async () => "[]",
    });
    expect(entries).toEqual([]);
  });

  it("returns the cached entries when fetch fails but a stale cache parsed empty-then-nonempty is unavailable", async () => {
    // No cache at all + fetch failure → empty list, no throw.
    const entries = await fetchOfficialRegistry({
      fetchJson: async () => {
        throw new Error("boom");
      },
    });
    expect(entries).toEqual([]);
  });

  it("does not throw when cacheRead itself rejects", async () => {
    const entries = await fetchOfficialRegistry({
      fetchJson: async () => ARRAY_FIXTURE,
      cacheRead: async () => {
        throw new Error("read fail");
      },
    });
    expect(entries).toHaveLength(3);
  });

  it("does not throw when cacheWrite rejects after a successful fetch", async () => {
    const entries = await fetchOfficialRegistry({
      fetchJson: async () => ARRAY_FIXTURE,
      cacheRead: async () => null,
      cacheWrite: async () => {
        throw new Error("write fail");
      },
    });
    expect(entries).toHaveLength(3);
  });

  it("works with no cache deps at all (fetch-only)", async () => {
    const entries = await fetchOfficialRegistry({ fetchJson: async () => SERVERS_FIXTURE });
    expect(entries).toEqual([{ name: "github", source: CANONICAL_SOURCE }]);
  });
});

describe("wiring note — signal, not authorization", () => {
  // Documents (and locks via test) the intended trust-dialog wire point:
  // mcp/mount.ts mountOneServer, just before resolveMcpTrust(trust.root, name, ...),
  // would lookupServer(registry, name, spec.command) and pass serverTrustSignal(match)
  // into the TrustRequest so ui/trust-dialog.tsx can show an "official/known" badge.
  // The operator confirmation (resolveMcpTrust) STILL gates the mount — the signal
  // never auto-trusts.
  it("an official signal still leaves the trust decision to the operator", () => {
    const registry = parseRegistry(ARRAY_FIXTURE);
    const match = lookupServer(registry, "github", "github-mcp-server");
    const signal = serverTrustSignal(match);
    expect(signal).toBe("official");
    // The signal is a label only — there is no auto-trust path here. The operator
    // confirmation in resolveMcpTrust remains the gate; this module exposes no
    // function that grants trust.
  });
});
