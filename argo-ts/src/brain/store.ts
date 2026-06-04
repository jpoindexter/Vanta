import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveArgoHome, commitInHome } from "../store/home.js";
import { BRAIN_REGIONS } from "./regions.js";

// File-backed brain store under ~/.argo/brain/<region>.md — git-versioned (like
// skills/memory) so the brain's growth is durable and reversible (never silently
// lost). One file per region; the agent reads a digest each session and writes
// via the `brain` tool.

export function brainDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveArgoHome(env), "brain");
}

function regionFile(name: string, env?: NodeJS.ProcessEnv): string {
  return join(brainDir(env), `${name}.md`);
}

/** Create the brain dir and seed any missing region files. Idempotent. */
export async function ensureBrain(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await mkdir(brainDir(env), { recursive: true });
  for (const r of BRAIN_REGIONS) {
    const f = regionFile(r.name, env);
    if (!existsSync(f)) await writeFile(f, r.seed, "utf8");
  }
}

/** Read one region's full content, or null if it doesn't exist yet. */
export async function readRegion(name: string, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  try {
    return await readFile(regionFile(name, env), "utf8");
  } catch {
    return null;
  }
}

/** Replace or append a region's content, then git-commit it in the Argo home. */
export async function writeRegion(
  name: string,
  content: string,
  opts: { append?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<void> {
  const env = opts.env;
  await ensureBrain(env);
  const f = regionFile(name, env);
  if (opts.append) {
    await appendFile(f, `\n${content.trim()}\n`, "utf8");
  } else {
    // MEM-VERSIONING: archive the old content before overwriting so the version
    // chain is preserved. Files live in brain/archive/<region>/ — the main
    // brain file is the current head; git history is the full chain.
    try {
      const old = await readFile(f, "utf8");
      if (old.trim()) {
        const archiveDir = join(brainDir(env), "archive", name);
        await mkdir(archiveDir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        await writeFile(join(archiveDir, `${ts}.md`), old, "utf8");
      }
    } catch { /* no prior file — nothing to archive */ }
    await writeFile(f, `${content.trim()}\n`, "utf8");
  }
  await commitInHome(join("brain", `${name}.md`), `brain: ${name}`, env);
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
  const parts: string[] = [];
  for (const r of BRAIN_REGIONS) {
    const raw = (await readRegion(r.name, env))?.trim();
    if (!raw) continue;
    const body = raw.length > perRegion ? `${raw.slice(0, perRegion)}…` : raw;
    parts.push(`### ${r.title}\n${body}`);
  }
  return parts.join("\n\n");
}
