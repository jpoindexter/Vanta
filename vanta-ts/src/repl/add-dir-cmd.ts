import { resolve } from "node:path";
import { existsSync } from "node:fs";
import type { SlashHandler } from "./types.js";
import { addSessionDir, getSessionDirs, expandHome } from "../tools/writable-zones.js";

// CC-ADD-DIR: add extra working directories for the session.
// Each added dir is immediately readable + writable for this session; the kernel
// still gates every individual access. Mirrors Claude Code's /add-dir.

function listDirs(env: NodeJS.ProcessEnv): string {
  const dirs = getSessionDirs(env);
  if (!dirs.length) return "  (no extra dirs added this session)";
  return dirs.map((d) => `  + ${d}`).join("\n");
}

export const addDir: SlashHandler = async (arg, ctx) => {
  if (!arg.trim()) {
    return { output: `  /add-dir <path> — add a directory to this session\n\nActive extra dirs:\n${listDirs(ctx.env)}` };
  }
  const abs = resolve(expandHome(arg.trim()));
  if (!existsSync(abs)) {
    return { output: `  path not found: ${abs}` };
  }
  addSessionDir(abs, ctx.env);
  return { output: `  ✓ added to session scope: ${abs}\n  The kernel will still ask before each access outside the project root.` };
};
