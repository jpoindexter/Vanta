import { z } from "zod";

// VANTA-SETTINGS-MEM — the `memory` settings block + pure resolvers.
// Standalone schema (no import from store.ts) so store.ts can fold it into
// SettingsSchema without a circular import. Every default reproduces today's
// behavior, so an unset block changes nothing:
//   - autoMemory → default OFF (matches today's opt-in VANTA_EXTRACT_MEMORIES)
//   - excludes   → default [] (no captured memory is dropped)
//   - plansDir   → default undefined (no plans dir configured)
// Env (VANTA_AUTO_MEMORY / VANTA_MEMORY_EXCLUDES / VANTA_PLANS_DIR) overrides
// the settings block; the settings block overrides the defaults. Pure — no I/O.

/** Operator-configurable memory block on settings.json. */
export const MemorySettingsSchema = z
  .object({
    /** Auto memory extraction on/off. Maps to VANTA_EXTRACT_MEMORIES. */
    autoMemory: z.boolean().optional(),
    /** Glob/substring patterns the memory layer must NOT capture. */
    excludes: z.array(z.string()).optional(),
    /** Where plan docs live (for the memory/plans layer). */
    plansDir: z.string().optional(),
  })
  .strict();

export type MemorySettings = z.infer<typeof MemorySettingsSchema>;

/** The effective memory config after env > settings > defaults resolution. */
export type EffectiveMemorySettings = {
  autoMemory: boolean;
  excludes: string[];
  plansDir?: string;
};

/** Minimal settings shape this resolver reads. Avoids a store.ts import. */
type SettingsWithMemory = { memory?: MemorySettings };

/** Truthy env flags: "1"/"true"/"on"/"yes" (case-insensitive). */
const TRUTHY = new Set(["1", "true", "on", "yes"]);
const FALSY = new Set(["0", "false", "off", "no"]);

function envBool(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim().toLowerCase();
  if (TRUTHY.has(v)) return true;
  if (FALSY.has(v)) return false;
  return undefined;
}

function envExcludes(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

function envPlansDir(raw: string | undefined): string | undefined {
  const v = raw?.trim();
  return v ? v : undefined;
}

/**
 * Resolve the effective memory config: env override > settings.memory > defaults.
 * Defaults preserve today's behavior (autoMemory off, no excludes, no plansDir).
 * Pure — reads only the passed settings + env, performs no I/O.
 */
export function resolveMemorySettings(
  settings: SettingsWithMemory,
  env: NodeJS.ProcessEnv,
): EffectiveMemorySettings {
  const mem = settings.memory ?? {};
  const autoMemory = envBool(env.VANTA_AUTO_MEMORY) ?? mem.autoMemory ?? false;
  const excludes = envExcludes(env.VANTA_MEMORY_EXCLUDES) ?? mem.excludes ?? [];
  const plansDir = envPlansDir(env.VANTA_PLANS_DIR) ?? mem.plansDir;
  return { autoMemory, excludes, plansDir };
}

/** Lower-cased substring match of one pattern against the text. */
function matchesPattern(text: string, pattern: string): boolean {
  const p = pattern.trim();
  if (!p) return false;
  return text.toLowerCase().includes(p.toLowerCase());
}

/**
 * Whether a captured memory should be dropped because it matches an exclude
 * pattern (case-insensitive substring). Empty/blank patterns never match, so an
 * empty exclude list drops nothing (today's behavior).
 */
export function isMemoryExcluded(text: string, excludes: string[]): boolean {
  return excludes.some((pattern) => matchesPattern(text, pattern));
}
