import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolveVantaHome, skillsDir } from "../store/home.js";
import { shellHooksPath } from "../hooks/shell-hooks.js";
import { listSkills } from "./store.js";
import { compileTriggers, compileTriggersForClaude, mergeVantaHooks, mergeClaudeSettings } from "./triggers.js";
import { compileTriggersForCodex, mergeAgentsMd } from "./triggers-codex.js";

// SKILL-TRIGGERS — the disk upserters. The single side-effecting layer: read all
// skills' triggers, compile them, and idempotently UPSERT the generated hooks into
// ~/.vanta/hooks.json (user scope only — always trusted, no project gate) and,
// opt-in, ~/.claude/settings.json. Best-effort; never throws.

/** The installed `vanta` launcher (matches cli/hooks-cmd.ts). */
function vantaBinPath(): string {
  return join(homedir(), ".local", "bin", "vanta");
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  try {
    const v: unknown = JSON.parse(await readFile(path, "utf8"));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Compile every skill's triggers and upsert them into ~/.vanta/hooks.json.
 * Idempotent (regenerates the generated entries, preserves hand-written hooks).
 * Returns the count written + which events were touched.
 */
export async function syncSkillTriggers(opts: { env?: NodeJS.ProcessEnv } = {}): Promise<{ written: number; events: string[] }> {
  const env = opts.env ?? process.env;
  const bin = vantaBinPath();
  const skills = await listSkills(env).catch(() => []);
  const compiled = skills.flatMap((s) => compileTriggers(s, bin));
  const home = resolveVantaHome(env);
  const path = shellHooksPath(home);
  const merged = mergeVantaHooks(await readJson(path), compiled);
  try {
    await mkdir(home, { recursive: true });
    await writeFile(path, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  } catch {
    /* best-effort: a non-writable store must never break session start */
  }
  return { written: compiled.length, events: [...new Set(compiled.map((c) => c.event))] };
}

/**
 * Opt-in: upsert the Claude-Code-compatible trigger hooks into ~/.claude/settings.json
 * (Stop + UserPromptSubmit only). Preserves the user's existing Claude hooks.
 */
export async function syncSkillTriggersForClaude(opts: { env?: NodeJS.ProcessEnv } = {}): Promise<{ written: number }> {
  const env = opts.env ?? process.env;
  const bin = vantaBinPath();
  const skills = await listSkills(env).catch(() => []);
  const compiled = skills.flatMap((s) => compileTriggersForClaude(s, bin));
  const dir = join(homedir(), ".claude");
  const path = join(dir, "settings.json");
  const merged = mergeClaudeSettings(await readJson(path), compiled);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(path, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  } catch {
    /* best-effort */
  }
  return { written: compiled.length };
}

async function readText(path: string): Promise<string> {
  try { return await readFile(path, "utf8"); } catch { return ""; }
}

/**
 * Opt-in: merge every skill's prompt-level routing into an AGENTS.md (default ~/.codex/AGENTS.md) —
 * the Codex equivalent of the Claude settings sync. Codex has no event hooks, so routing is a
 * standing instruction it reads each session. Idempotent; preserves the rest of the file.
 */
export async function syncSkillTriggersForCodex(opts: { env?: NodeJS.ProcessEnv; path?: string } = {}): Promise<{ written: number; path: string }> {
  const env = opts.env ?? process.env;
  const skills = await listSkills(env).catch(() => []);
  const lines = skills.map((s) => compileTriggersForCodex(s)).filter((l): l is string => l !== null);
  const path = opts.path ?? join(homedir(), ".codex", "AGENTS.md");
  const merged = mergeAgentsMd(await readText(path), lines);
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, merged, "utf8");
  } catch {
    /* best-effort */
  }
  return { written: lines.length, path };
}

/** Resolve a skill's on-disk SKILL.md path (for the emitter). */
export function skillMdPath(slug: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(skillsDir(env), slug, "SKILL.md");
}
