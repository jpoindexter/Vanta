import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

// Secret-bearing files that live in the Vanta home and must never be committed
// to its git history. The home is git-init'd for free versioning, so one stray
// `git add -A` would otherwise seal credentials into the repo.
const GITIGNORE_ENTRIES = [
  "google-tokens.json",
  "mcp-auth-tokens.json",
  "cookies/",
  "*.cookie",
  "*-qids.json",
  "*.key",
  "*-tokens.json",
  ".env",
  ".env.*",
] as const;

/**
 * Write a `.gitignore` covering the home's secret files, if one is absent.
 * Best-effort — a write failure must not block store setup.
 */
async function ensureGitignore(home: string): Promise<void> {
  const path = join(home, ".gitignore");
  if (existsSync(path)) return;
  try {
    await writeFile(path, GITIGNORE_ENTRIES.join("\n") + "\n", "utf8");
  } catch {
    // best-effort — versioning safety only, store still works
  }
}

/**
 * The Vanta home store — global across projects, not the per-project kernel
 * `.vanta/` data dir. Holds skills and memories. Override with VANTA_HOME (tests
 * point this at a temp dir). Default: ~/.vanta.
 */
export function resolveVantaHome(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.VANTA_HOME?.trim();
  return override ? override : join(homedir(), ".vanta");
}

export function skillsDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "skills");
}

export function memoriesDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "memories");
}

/**
 * Reduce an arbitrary skill name to a safe directory slug. Strips path
 * separators and traversal so a skill write can never escape skillsDir().
 */
export function slugifySkillName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-_ ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "unnamed-skill";
}

/**
 * Create the store dirs and git-init the home for free versioning. Idempotent.
 * Git is best-effort — versioning never blocks the learning loop.
 */
export async function ensureVantaStore(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const home = resolveVantaHome(env);
  // One-time migration: the default home moved ~/.vanta → ~/.vanta (Argo→Vanta
  // rename). Move it whole — preserves skills/memories/brain + the .git history.
  // Skipped when VANTA_HOME points elsewhere (tests, custom installs).
  if (!env.VANTA_HOME?.trim()) {
    const legacy = join(homedir(), ".vanta");
    if (!existsSync(home) && existsSync(legacy)) {
      try {
        await rename(legacy, home);
      } catch {
        // best-effort — a fresh store is created below if the move fails
      }
    }
  }
  await mkdir(skillsDir(env), { recursive: true });
  await mkdir(memoriesDir(env), { recursive: true });
  if (!existsSync(join(home, ".git"))) {
    try {
      await run("git", ["init", "-q"], { cwd: home });
      await run("git", ["config", "user.email", "vanta@local"], { cwd: home });
      await run("git", ["config", "user.name", "Vanta"], { cwd: home });
    } catch {
      // git unavailable — versioning is optional, store still works
    }
  }
  // Always ensure the secret-file .gitignore exists (independent of git-init so
  // pre-existing stores without one get protected on the next run).
  await ensureGitignore(home);
  return home;
}

/**
 * Best-effort commit of a changed path in the Vanta home. Never throws — a
 * failed commit (nothing staged, no git) must not break a skill/memory write.
 */
export async function commitInHome(
  relPath: string,
  message: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const home = resolveVantaHome(env);
  try {
    await run("git", ["add", relPath], { cwd: home });
    await run("git", ["commit", "-q", "-m", message], { cwd: home });
  } catch {
    // nothing to commit or git unavailable — fine
  }
}
