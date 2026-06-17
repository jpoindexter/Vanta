import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

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
