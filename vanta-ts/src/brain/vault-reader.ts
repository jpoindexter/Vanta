import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { resolveVaultPath } from "./vault-bridge.js";
import type { VaultReader } from "./vault-recall.js";

// The production VaultReader — the one impure, filesystem-touching seam of the
// brain↔vault read bridge (vault-recall.ts stays pure-testable with injected
// readers). Split out for the size gate; re-exported from vault-recall.ts so
// callers (brain.ts) use the same module path.

const MD_EXT = ".md";

async function walkMarkdown(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      const full = join(dir, ent.name);
      if (ent.isDirectory()) await walk(full);
      else if (ent.isFile() && ent.name.endsWith(MD_EXT)) out.push(relative(root, full).split(sep).join("/"));
    }
  }
  await walk(root);
  return out;
}

/**
 * The production VaultReader: reads the configured Obsidian vault directly off
 * the filesystem (same access the write-side bridge uses). Returns null when no
 * vault is configured, so callers degrade to plain brain recall.
 */
export async function resolveVaultReader(env: NodeJS.ProcessEnv = process.env): Promise<VaultReader | null> {
  const vault = await resolveVaultPath(env);
  if (!vault) return null;
  return {
    list: () => walkMarkdown(vault),
    read: (path) => readFile(join(vault, path), "utf8").catch(() => null),
  };
}
