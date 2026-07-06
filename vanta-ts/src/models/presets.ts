import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";
import { EFFORT_LEVELS, type EffortLevel } from "../types.js";

// OP-MODEL-PRESETS — per-model preference memory: selecting a model re-applies
// the effort you last used WITH THAT MODEL (a local 8B wants high effort, a
// frontier model medium — re-tuning on every switch is the friction). Stored at
// ~/.vanta/model-presets.json, keyed by modelId. Vanta has no separate "fast
// mode" toggle (effort IS the speed/quality dial here), so the preset carries
// effort; the schema leaves room for future per-model keys.

export const ModelPresetSchema = z.object({
  effort: z.enum(EFFORT_LEVELS).optional(),
  updated: z.string(),
});
export type ModelPreset = z.infer<typeof ModelPresetSchema>;

const StoreSchema = z.record(z.string(), ModelPresetSchema);
export type ModelPresets = z.infer<typeof StoreSchema>;

export function presetsPath(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "model-presets.json");
}

/** Tolerant load: missing/corrupt file → empty map (never wedges a switch). */
export async function loadPresets(env: NodeJS.ProcessEnv = process.env): Promise<ModelPresets> {
  try {
    const parsed = StoreSchema.safeParse(JSON.parse(await readFile(presetsPath(env), "utf8")));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export async function savePresets(map: ModelPresets, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await mkdir(resolveVantaHome(env), { recursive: true });
  await writeFile(presetsPath(env), `${JSON.stringify(map, null, 2)}\n`, "utf8");
}

/** Remember a per-model setting (merge-patch). Pure. */
export function rememberPreset(
  map: ModelPresets,
  modelId: string,
  patch: { effort?: EffortLevel },
  now: Date = new Date(),
): ModelPresets {
  const prev = map[modelId];
  return { ...map, [modelId]: { ...prev, ...patch, updated: now.toISOString() } };
}

/** The remembered preset for a model, or null. Pure. */
export function presetFor(map: ModelPresets, modelId: string): ModelPreset | null {
  return map[modelId] ?? null;
}

/** Best-effort persist of an effort change for the active model. */
export async function rememberEffort(modelId: string, effort: EffortLevel, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  try {
    await savePresets(rememberPreset(await loadPresets(env), modelId, { effort }), env);
  } catch {
    /* preference memory must never break the command that triggered it */
  }
}
