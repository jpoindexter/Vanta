import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";
import { defaultNdConfig, defaultNdPreferences, defaultNdProfile } from "./engine.js";
import { GATES } from "./gates.js";
import {
  OUTPUT_DENSITIES,
  SENSORY_LOADS,
  TIME_SUPPORT_STYLES,
  type GateId,
  type NdConfig,
  type NdPreferences,
  type NdProfile,
} from "./types.js";

// Per-user ND support profile. Lives at ~/.vanta/nd-profile.json — the mechanism
// that makes the support set "for the user, configurable" rather than hardcoded.
// It carries BOTH the EF gate config (which gates are on + their thresholds, what
// drives the engine) AND non-gate communication/time preferences (output density,
// sensory load, time-support style). Missing/extra keys are tolerated: load always
// merges over the built-in defaults so a new gate/pref appears at its default
// without a profile rewrite. The legacy bare-gate-map file format still loads.

const FILE = "nd-profile.json";

const GateConfigSchema = z.object({ enabled: z.boolean(), threshold: z.number() }).partial();
const NdConfigSchema = z.record(GateConfigSchema);
const PreferencesSchema = z
  .object({
    outputDensity: z.enum(OUTPUT_DENSITIES),
    sensoryLoad: z.enum(SENSORY_LOADS),
    timeSupport: z.enum(TIME_SUPPORT_STYLES),
  })
  .partial();
// The file is the full profile, but stays tolerant of the legacy shape where the
// top level WAS the bare gate map (no `gates`/`prefs` keys).
const NdProfileSchema = z.object({ gates: NdConfigSchema, prefs: PreferencesSchema }).partial();

type SavedGates = Partial<Record<string, { enabled?: boolean; threshold?: number }>>;
type SavedPrefs = Partial<NdPreferences>;

export function ndProfilePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), FILE);
}

/** Master switch — `VANTA_ND=off` disables the whole engine. */
export function ndEngineEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.VANTA_ND ?? "on").toLowerCase() !== "off";
}

/** Merge a partial saved gate config over the built-in defaults (defaults win for gaps). */
function mergeGatesOverDefaults(saved: SavedGates): NdConfig {
  const base = defaultNdConfig();
  for (const g of GATES) {
    const s = saved[g.id];
    if (!s) continue;
    if (typeof s.enabled === "boolean") base[g.id].enabled = s.enabled;
    if (typeof s.threshold === "number") base[g.id].threshold = s.threshold;
  }
  return base;
}

/** Merge a partial saved prefs over the built-in defaults (defaults win for gaps). */
function mergePrefsOverDefaults(saved: SavedPrefs): NdPreferences {
  return { ...defaultNdPreferences(), ...saved };
}

/**
 * Read the raw file and split it into saved gate + pref slices, tolerating both
 * the current `{gates, prefs}` shape and the legacy bare-gate-map shape.
 */
function splitSaved(raw: unknown): { gates: SavedGates; prefs: SavedPrefs } {
  const asProfile = NdProfileSchema.safeParse(raw);
  if (asProfile.success && (asProfile.data.gates || asProfile.data.prefs)) {
    return { gates: asProfile.data.gates ?? {}, prefs: asProfile.data.prefs ?? {} };
  }
  // Legacy: the top level was the bare gate map.
  const asLegacy = NdConfigSchema.safeParse(raw);
  return { gates: asLegacy.success ? asLegacy.data : {}, prefs: {} };
}

/** Load the user's whole ND profile, always complete (defaults fill any gaps). */
export async function loadNdProfile(env: NodeJS.ProcessEnv = process.env): Promise<NdProfile> {
  try {
    const { gates, prefs } = splitSaved(JSON.parse(await readFile(ndProfilePath(env), "utf8")));
    return { gates: mergeGatesOverDefaults(gates), prefs: mergePrefsOverDefaults(prefs) };
  } catch {
    return defaultNdProfile();
  }
}

/** Persist the whole ND profile (creates the home dir if needed). */
export async function saveNdProfile(profile: NdProfile, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await mkdir(resolveVantaHome(env), { recursive: true });
  await writeFile(ndProfilePath(env), JSON.stringify(profile, null, 2), "utf8");
}

/** Load just the EF gate config (what the engine consumes). */
export async function loadNdConfig(env: NodeJS.ProcessEnv = process.env): Promise<NdConfig> {
  return (await loadNdProfile(env)).gates;
}

/** Persist a new gate config, preserving the saved preferences. */
export async function saveNdConfig(config: NdConfig, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const current = await loadNdProfile(env);
  await saveNdProfile({ gates: config, prefs: current.prefs }, env);
}

/** Persist new preferences, preserving the saved gate config. */
export async function saveNdPreferences(prefs: NdPreferences, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const current = await loadNdProfile(env);
  await saveNdProfile({ gates: current.gates, prefs }, env);
}

/** Focused accessor: the user's output density, for a renderer / the prompt to read. */
export async function getOutputDensity(env: NodeJS.ProcessEnv = process.env): Promise<NdPreferences["outputDensity"]> {
  return (await getNdProfileCached(env)).prefs.outputDensity;
}

/** True if `id` is a real gate. */
export function isGateId(id: string): id is GateId {
  return GATES.some((g) => g.id === id);
}

// Session cache so the engine doesn't re-read the profile every turn. Keyed by
// home dir; `/nd` invalidates it after a save.
let cached: { key: string; profile: NdProfile } | null = null;

export async function getNdProfileCached(env: NodeJS.ProcessEnv = process.env): Promise<NdProfile> {
  const key = resolveVantaHome(env);
  if (cached && cached.key === key) return cached.profile;
  const profile = await loadNdProfile(env);
  cached = { key, profile };
  return profile;
}

/** Cached EF gate config (what the engine reads each turn). */
export async function getNdConfigCached(env: NodeJS.ProcessEnv = process.env): Promise<NdConfig> {
  return (await getNdProfileCached(env)).gates;
}

export function invalidateNdConfig(): void {
  cached = null;
}
