import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readMcpConfig } from "../mcp/mount.js";
import type { BrainEntry } from "./entries.js";

// The brain↔vault bridge. When a brain memory crystallizes (proven durable via
// repeated recall), it graduates to the Obsidian vault as a permanent wiki page.
// Division of labor: the brain holds self + user-model + working memory (decays,
// auto); the vault holds durable world-knowledge (permanent, searchable). Only
// crystallized SEMANTIC knowledge graduates — identity/user_model/mood stay in
// the brain. No-ops cleanly when no obsidian-vault MCP server is configured.

const KNOWLEDGE_TYPES = new Set(["fact", "insight", "pattern", "skill"]);

/** A crystallized semantic fact = durable world-knowledge that earns a vault page. */
export function isPromotable(e: BrainEntry): boolean {
  return (
    e.region === "semantic" &&
    e.crystalStatus === "crystallized" &&
    KNOWLEDGE_TYPES.has(e.entryType) &&
    !(e.sourceRef ?? "").startsWith("vault:")
  );
}

/** Resolve the Obsidian vault path from the obsidian-vault MCP server config. */
export async function resolveVaultPath(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  try {
    const { servers } = await readMcpConfig(env);
    for (const [name, spec] of Object.entries(servers)) {
      const isVault = name.includes("obsidian") || (spec.args ?? []).some((a) => a.includes("obsidian-vault-mcp"));
      if (!isVault) continue;
      const fromArg = (spec.args ?? []).find((a) => !a.endsWith(".mjs") && !a.endsWith(".js"));
      const path = spec.env?.VAULT_PATH ?? fromArg;
      if (path) return path;
    }
  } catch { /* no config / unreadable — vault simply not wired */ }
  return null;
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "untitled";
}

/** Render a crystallized brain entry as an Obsidian wiki page (matches vault format). */
export function wikiPage(e: BrainEntry, date: string): string {
  const title = (e.content.split("\n")[0] ?? "").slice(0, 80);
  return (
    `---\ntags: [brain, ${e.entryType}]\ntype: concept\nsource: "brain:${e.id}"\ncreated: ${date}\n---\n\n` +
    `# ${title}\n\n${e.content}\n\n` +
    `## Related\n_Graduated from Vanta's brain — crystallized after ${e.retrievalCount} recalls._\n`
  );
}

/** Write one entry to <vault>/wiki/concepts/<slug>.md. Returns the rel path or null. */
export async function writeVaultPage(vault: string, e: BrainEntry, date: string): Promise<string | null> {
  try {
    const rel = join("wiki", "concepts", `${slugify(e.content.split("\n")[0] ?? "")}.md`);
    await mkdir(join(vault, "wiki", "concepts"), { recursive: true });
    await writeFile(join(vault, rel), wikiPage(e, date), "utf8");
    return rel;
  } catch {
    return null;
  }
}
