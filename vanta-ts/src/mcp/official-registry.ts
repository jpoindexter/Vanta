import { z } from "zod";

// MCP-OFFICIAL-REGISTRY — consult a registry of known/official MCP servers so a
// server declared in `.mcp.json` can be surfaced as "official" or "known" in the
// trust dialog.
//
// THIS IS A SIGNAL, NOT AN AUTHORIZATION. A registry match never auto-trusts a
// server: the operator still confirms before it mounts (resolveMcpTrust), and the
// kernel `assess()` still gates every tool the server registers. The registry is
// an UNTRUSTED external source — entries are validated, garbage is dropped, and a
// fetch failure degrades to cache-or-empty (never throws). Being in the registry
// only adds an informational label to the existing dialog.
//
// This module is PURE + injectable: parse/lookup/signal take plain data, and
// `fetchOfficialRegistry` takes its network + cache as injected deps, so it
// unit-tests with no real HTTP and no filesystem.

/** The canonical source label — a match from it earns the "official" signal. */
export const CANONICAL_SOURCE = "official-registry";

/** One validated registry entry: a known MCP server's identity + provenance. */
export type RegistryEntry = {
  /** Server name as it would appear as the `.mcp.json` key. */
  name: string;
  /** Stdio launch command, when the entry is a stdio server. */
  command?: string;
  /** npm/package name the server ships as, when published. */
  packageName?: string;
  /** Provenance label. `CANONICAL_SOURCE` → "official"; anything else → "known". */
  source?: string;
};

/** Trust signal a registry lookup yields for the dialog. */
export type ServerTrustSignal = "official" | "known" | "unknown";

// An optional string that tolerates an empty/blank value by coercing it to
// undefined — a present-but-empty field shouldn't reject the whole row.
const optStr = z
  .string()
  .optional()
  .transform((s) => (s && s.trim() ? s : undefined));

// Tolerant entry schema: name is required (the key we match on); the rest are
// optional strings. Unknown fields are stripped. A non-object / nameless row is
// rejected and dropped rather than poisoning the registry.
const EntrySchema = z
  .object({
    name: z.string().min(1),
    command: optStr,
    packageName: optStr,
    source: optStr,
  })
  .transform((e): RegistryEntry => ({
    name: e.name,
    ...(e.command ? { command: e.command } : {}),
    ...(e.packageName ? { packageName: e.packageName } : {}),
    ...(e.source ? { source: e.source } : {}),
  }));

// The registry JSON may be a bare array of entries or an object with a `servers`
// array (the two shapes real registries ship). Anything else → no entries.
const RegistrySchema = z.union([
  z.array(z.unknown()),
  z.object({ servers: z.array(z.unknown()) }).transform((o) => o.servers),
]);

/**
 * Parse a registry JSON string into validated entries. Tolerant: invalid JSON,
 * a non-array/non-`{servers:[]}` shape, or individual malformed rows all yield
 * an empty list / are dropped — never throws. The external registry is untrusted
 * input, so a single bad row can't corrupt the lookup.
 */
export function parseRegistry(json: string): RegistryEntry[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  const rows = RegistrySchema.safeParse(raw);
  if (!rows.success) return [];
  const entries: RegistryEntry[] = [];
  for (const row of rows.data) {
    const parsed = EntrySchema.safeParse(row);
    if (parsed.success) entries.push(parsed.data);
  }
  return entries;
}

/**
 * Look a declared server up in the registry. Matches by name (case-insensitive)
 * first; when a `command` is supplied, also matches an entry whose `command` or
 * `packageName` the command contains (so a `npx -y @scope/pkg` launch line still
 * resolves a `packageName`-only entry). Returns the matched entry or null. Pure.
 */
export function lookupServer(
  registry: RegistryEntry[],
  serverName: string,
  command?: string,
): RegistryEntry | null {
  const wanted = serverName.trim().toLowerCase();
  const cmd = command?.trim().toLowerCase();
  const byName = registry.find((e) => e.name.toLowerCase() === wanted);
  if (byName) return byName;
  if (!cmd) return null;
  const byCommand = registry.find((e) => {
    const ecmd = e.command?.toLowerCase();
    const epkg = e.packageName?.toLowerCase();
    return (ecmd && cmd.includes(ecmd)) || (epkg && cmd.includes(epkg));
  });
  return byCommand ?? null;
}

/**
 * Classify a lookup result into a trust SIGNAL for the dialog. A match from the
 * canonical source is "official"; any other match is "known"; no match (null) is
 * "unknown" (the current default behavior — nothing changes for unknown servers).
 * Pure. This is informational only; it never grants trust.
 */
export function serverTrustSignal(match: RegistryEntry | null): ServerTrustSignal {
  if (!match) return "unknown";
  return match.source === CANONICAL_SOURCE ? "official" : "known";
}

/** Reads the cached registry JSON, or null when no cache exists. */
export type CacheRead = () => Promise<string | null>;
/** Writes the freshly-fetched registry JSON to the cache (best-effort). */
export type CacheWrite = (json: string) => Promise<void>;
/** Fetches the live registry JSON over the network (the documented boundary). */
export type FetchJson = () => Promise<string>;

/** Injected dependencies for {@link fetchOfficialRegistry}. */
export type FetchRegistryDeps = {
  /** The live registry fetch. THE network boundary — the only impure input. */
  fetchJson: FetchJson;
  /** Optional cache read (cache-first). */
  cacheRead?: CacheRead;
  /** Optional cache write (refresh after a successful fetch). */
  cacheWrite?: CacheWrite;
};

/**
 * Resolve the official registry, cache-first. Reads the cache and returns it when
 * it parses to a non-empty list; otherwise fetches live, caches the raw JSON, and
 * returns the parsed entries. NEVER throws: a fetch failure falls back to the
 * cached entries (if any) or an empty list. Returning `[]` means "no known
 * servers" → every server stays "unknown" (the safe default). The live HTTP fetch
 * inside `fetchJson` is the documented boundary; everything else is pure given
 * the injected deps.
 */
export async function fetchOfficialRegistry(deps: FetchRegistryDeps): Promise<RegistryEntry[]> {
  const cached = await readCache(deps.cacheRead);
  if (cached.length > 0) return cached;
  try {
    const json = await deps.fetchJson();
    const entries = parseRegistry(json);
    if (entries.length > 0 && deps.cacheWrite) {
      await deps.cacheWrite(json).catch(() => {});
    }
    return entries;
  } catch {
    return cached; // fetch failed → cached (possibly empty), never throw
  }
}

/** Read + parse the cache, swallowing any read/parse error to an empty list. */
async function readCache(cacheRead?: CacheRead): Promise<RegistryEntry[]> {
  if (!cacheRead) return [];
  try {
    const raw = await cacheRead();
    return raw ? parseRegistry(raw) : [];
  } catch {
    return [];
  }
}
