import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ProviderEntry } from "./providers/catalog.js";

// The `.env` file seam for `vanta setup`: pure merge/strip helpers plus the one
// disk writer. Everything here preserves the user's other keys (Google OAuth,
// search keys, etc.) — a re-run can never delete unrelated secrets.

const KEY_LINE = /^(\s*)([A-Z0-9_]+)=/;

export function envPath(repoRoot: string): string {
  return join(repoRoot, "vanta-ts", ".env");
}

/**
 * Merge `updates` into an existing `.env` text. Replaces the value of each key
 * that already appears uncommented; appends keys that don't. Every other
 * line — comments, blank lines, unrelated keys — is preserved verbatim, so a
 * re-run can never delete the user's other secrets. Pure.
 */
export function upsertEnv(existing: string, updates: Record<string, string>): string {
  const pending = new Map(Object.entries(updates));
  const lines = existing.length ? existing.split("\n") : [];

  const out = lines.map((line) => {
    const m = KEY_LINE.exec(line);
    if (m && pending.has(m[2] as string)) {
      const key = m[2] as string;
      const value = pending.get(key) as string;
      pending.delete(key);
      return `${key}=${value}`;
    }
    return line;
  });

  if (pending.size > 0) {
    if (out.length > 0 && (out[out.length - 1] ?? "").trim() !== "") out.push("");
    for (const [key, value] of pending) out.push(`${key}=${value}`);
  }

  const text = out.join("\n");
  return text.endsWith("\n") ? text : `${text}\n`;
}

/** Remove uncommented lines for the given keys from a .env body. Pure. */
export function removeEnvKeys(existing: string, keys: readonly string[]): string {
  if (!keys.length || !existing) return existing;
  const drop = new Set(keys);
  return existing
    .split("\n")
    .filter((line) => {
      const m = KEY_LINE.exec(line);
      return !(m && drop.has(m[2] as string));
    })
    .join("\n");
}

/**
 * Upsert `updates` AND strip any stale legacy `ARGO_*` twin of each updated
 * `VANTA_*` key, so an explicit model write becomes the single source of truth
 * and can't be shadowed by a leftover ARGO_* config the back-compat shim mirrors
 * (the "stuck on codex" bug: `.env` still held ARGO_PROVIDER=codex). Pure.
 */
export function upsertEnvMigratingLegacy(existing: string, updates: Record<string, string>): string {
  const twins = Object.keys(updates)
    .filter((k) => k.startsWith("VANTA_"))
    .map((k) => `ARGO_${k.slice("VANTA_".length)}`);
  return upsertEnv(removeEnvKeys(existing, twins), updates);
}

/** Build the env keys a chosen provider implies. Pure. */
export function buildEnvUpdates(
  entry: ProviderEntry,
  apiKey: string | undefined,
  model: string,
): Record<string, string> {
  const updates: Record<string, string> = {
    VANTA_PROVIDER: entry.id,
    VANTA_MODEL: model,
  };
  if (entry.envVar && apiKey) updates[entry.envVar] = apiKey;
  return updates;
}

/** Merge `updates` into vanta-ts/.env (0600), preserving everything else. */
export async function setEnv(repoRoot: string, updates: Record<string, string>): Promise<void> {
  const path = envPath(repoRoot);
  const existing = existsSync(path) ? await readFile(path, "utf8") : "";
  await writeFile(path, upsertEnvMigratingLegacy(existing, updates), { mode: 0o600 });
}
