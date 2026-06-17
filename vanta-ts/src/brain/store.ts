import { join } from "node:path";
import { resolveVantaHome } from "../store/home.js";
import { resolveMemoryStore } from "../store/memory-store.js";
import { BRAIN_REGIONS } from "./regions.js";

// File-backed brain store under ~/.vanta/brain/<region>.md — git-versioned (like
// skills/memory) so the brain's growth is durable and reversible (never silently
// lost). One file per region; the agent reads a digest each session and writes
// via the `brain` tool.

export function brainDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "brain");
}

/** Home-relative path of a region file: `brain/<name>.md`. */
function regionRel(name: string): string {
  return join("brain", `${name}.md`);
}

/** Create the brain dir and seed any missing region files. Idempotent. */
export async function ensureBrain(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const store = resolveMemoryStore(env);
  await store.ensure();
  for (const r of BRAIN_REGIONS) {
    if ((await store.read(regionRel(r.name))) === null) {
      await store.write(regionRel(r.name), r.seed);
    }
  }
}

/** Read one region's full content, or null if it doesn't exist yet. */
export async function readRegion(name: string, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  return resolveMemoryStore(env).read(regionRel(name));
}

/** Replace or append a region's content, then git-commit it in the Vanta home. */
export async function writeRegion(
  name: string,
  content: string,
  opts: { append?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<void> {
  const env = opts.env;
  const store = resolveMemoryStore(env);
  await ensureBrain(env);
  const rel = regionRel(name);
  if (opts.append) {
    await store.append(rel, `\n${content.trim()}\n`);
  } else {
    // MEM-VERSIONING: archive the old content before overwriting so the version
    // chain is preserved. Files live in brain/archive/<region>/ — the main
    // brain file is the current head; git history is the full chain.
    const old = await store.read(rel);
    if (old?.trim()) {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      await store.write(join("brain", "archive", name, `${ts}.md`), old);
    }
    await store.write(rel, `${content.trim()}\n`);
  }
  await store.commit(rel, `brain: ${name}`);
}

/**
 * A compact digest of the whole brain for prompt injection — each region capped
 * so a growing brain never blows the context window (the digest is a window into
 * the brain, not the whole thing; the agent uses the `brain` tool to read more).
 */
export async function brainDigest(
  env: NodeJS.ProcessEnv = process.env,
  perRegion = 600,
): Promise<string> {
  await ensureBrain(env);
  // MEM-LAYERS: iterate ALL regions so nothing written is dark-memory.
  // BRAIN-SALIENCE: inject salience + executive first — attention allocation
  // should modulate all subsequent processing.
  const PRIORITY_FIRST = ["salience", "executive"];
  const ordered = [
    ...BRAIN_REGIONS.filter((r) => PRIORITY_FIRST.includes(r.name)),
    ...BRAIN_REGIONS.filter((r) => !PRIORITY_FIRST.includes(r.name)),
  ];
  const parts: string[] = [];
  for (const r of ordered) {
    const raw = (await readRegion(r.name, env))?.trim();
    if (!raw) continue;
    const body = raw.length > perRegion ? `${raw.slice(0, perRegion)}…` : raw;
    parts.push(`### ${r.title}\n${body}`);
  }
  return parts.join("\n\n");
}
