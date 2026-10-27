import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { mirrorLegacyEnv } from "../env-compat.js";
import { resolveVantaHome } from "../store/home.js";

export function findRepoRoot(env: NodeJS.ProcessEnv = process.env): string {
  const selectedProject = env.VANTA_PROJECT_ROOT?.trim();
  if (selectedProject && existsSync(selectedProject)) return resolve(selectedProject);
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "Cargo.toml"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

export function loadEnv(repoRoot: string, env: NodeJS.ProcessEnv = process.env): void {
  // Node's loadEnvFile only fills keys that are not already present, so this
  // order gives ambient > project > worktree > persistent-home precedence.
  try {
    loadFile(join(repoRoot, ".vanta", ".env"), env);
  } catch {
    // no project-local desktop config
  }
  try {
    loadFile(join(repoRoot, "vanta-ts", ".env"), env);
  } catch {
    // no .env file — rely on the ambient environment
  }
  try {
    loadFile(join(resolveVantaHome(env), ".env"), env);
  } catch {
    // No persistent fallback yet — a genuinely fresh install may run setup.
  }
  mirrorLegacyEnv(env);
}

function loadFile(file: string, env: NodeJS.ProcessEnv): void {
  if (env === process.env) { process.loadEnvFile(file); return; }
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
    if (env[key] === undefined) env[key] = value;
  }
}
