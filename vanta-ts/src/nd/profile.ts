import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";
import { defaultNdConfig } from "./engine.js";
import { GATES } from "./gates.js";
import type { GateId, NdConfig } from "./types.js";

// Per-user ND support profile (which EF gates are on + their thresholds). Lives
// at ~/.vanta/nd-profile.json — the mechanism that makes the gate set "for the
// user, configurable" rather than hardcoded. Missing/extra keys are tolerated:
// load always merges over the built-in defaults so a new gate appears enabled
// per its default without a profile rewrite.

const FILE = "nd-profile.json";

const GateConfigSchema = z.object({ enabled: z.boolean(), threshold: z.number() }).partial();
const NdConfigSchema = z.record(GateConfigSchema);

export function ndProfilePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), FILE);
}

/** Master switch — `VANTA_ND=off` disables the whole engine. */
export function ndEngineEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.VANTA_ND ?? "on").toLowerCase() !== "off";
}

/** Merge a partial saved config over the built-in defaults (defaults win for gaps). */
function mergeOverDefaults(saved: Partial<Record<string, { enabled?: boolean; threshold?: number }>>): NdConfig {
  const base = defaultNdConfig();
  for (const g of GATES) {
    const s = saved[g.id];
    if (!s) continue;
    if (typeof s.enabled === "boolean") base[g.id].enabled = s.enabled;
    if (typeof s.threshold === "number") base[g.id].threshold = s.threshold;
  }
  return base;
}

/** Load the user's ND config, always complete (defaults fill any gaps). */
export async function loadNdConfig(env: NodeJS.ProcessEnv = process.env): Promise<NdConfig> {
  try {
    const parsed = NdConfigSchema.safeParse(JSON.parse(await readFile(ndProfilePath(env), "utf8")));
    return mergeOverDefaults(parsed.success ? parsed.data : {});
  } catch {
    return defaultNdConfig();
  }
}

/** Persist the ND config (creates the home dir if needed). */
export async function saveNdConfig(config: NdConfig, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await mkdir(resolveVantaHome(env), { recursive: true });
  await writeFile(ndProfilePath(env), JSON.stringify(config, null, 2), "utf8");
}

/** True if `id` is a real gate. */
export function isGateId(id: string): id is GateId {
  return GATES.some((g) => g.id === id);
}

// Session cache so the engine doesn't re-read the profile every turn. Keyed by
// home dir; `/nd` invalidates it after a save.
let cached: { key: string; config: NdConfig } | null = null;

export async function getNdConfigCached(env: NodeJS.ProcessEnv = process.env): Promise<NdConfig> {
  const key = resolveVantaHome(env);
  if (cached && cached.key === key) return cached.config;
  const config = await loadNdConfig(env);
  cached = { key, config };
  return config;
}

export function invalidateNdConfig(): void {
  cached = null;
}
