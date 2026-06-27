/**
 * Manifest dependency parsing: read an optional `dependsOn` array off a parsed
 * plugin manifest. This is input-adaptation (manifest → clean dep names), the
 * concern UPSTREAM of `dep-resolve.ts`'s graph resolution — `loadEnabledPlugins`
 * calls `parsePluginDeps` per manifest, then feeds the resulting `PluginNode[]`
 * to `resolveLoadOrder`. PURE. Nothing here reads the filesystem.
 */

/**
 * Read an optional `dependsOn` array off a parsed plugin manifest (a plain
 * record; NOT routed through the strict `PluginManifestSchema`, which rejects
 * unknown keys — mirror `parsePluginLsp`). Absent / non-array / garbage → [].
 * Each entry must be a non-empty string; non-strings and blanks are dropped.
 * Self-references are dropped (a plugin can't depend on itself). Deduped,
 * order-preserving (first occurrence wins).
 */
export function parsePluginDeps(manifest: unknown): string[] {
  if (!manifest || typeof manifest !== "object") return [];
  const record = manifest as Record<string, unknown>;
  const raw = record.dependsOn;
  if (!Array.isArray(raw)) return [];
  const self = typeof record.name === "string" ? record.name.trim() : "";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const name = entry.trim();
    if (!name) continue;
    if (name === self) continue; // drop self-refs
    if (seen.has(name)) continue; // dedupe
    seen.add(name);
    out.push(name);
  }
  return out;
}
