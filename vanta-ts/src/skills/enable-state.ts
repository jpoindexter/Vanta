import { readUserSettingsRaw, updateUserSettings } from "../settings/user-edit.js";
import { SkillOverridesSchema, skillVisibleToModel, type SkillOverrides } from "./overrides.js";

/** The operator's per-skill overrides from user settings.json (invalid entries read as none). */
export async function readSkillOverrides(env?: NodeJS.ProcessEnv): Promise<SkillOverrides> {
  const parsed = SkillOverridesSchema.safeParse((await readUserSettingsRaw(env)).skillOverrides ?? {});
  return parsed.success ? parsed.data : {};
}

export function isSkillEnabled(name: string, overrides: SkillOverrides): boolean {
  return skillVisibleToModel(name, overrides) && overrides[name]?.disabled !== true;
}

function withDisabled(current: SkillOverrides, name: string, enabled: boolean): SkillOverrides {
  const next: SkillOverrides = { ...current };
  const { disabled: _disabled, ...rest } = next[name] ?? {};
  const entry = enabled ? rest : { ...rest, disabled: true };
  if (Object.keys(entry).length) next[name] = entry; else delete next[name];
  return next;
}

/**
 * Turns a skill on or off for the model and the menu by writing `skillOverrides[name].disabled`
 * to user settings. Only that key changes; the skill itself stays on disk.
 */
export async function setSkillEnabled(name: string, enabled: boolean, env?: NodeJS.ProcessEnv): Promise<void> {
  await updateUserSettings((settings) => {
    const parsed = SkillOverridesSchema.safeParse(settings.skillOverrides ?? {});
    const next = withDisabled(parsed.success ? parsed.data : {}, name, enabled);
    const { skillOverrides: _old, ...others } = settings;
    return Object.keys(next).length ? { ...others, skillOverrides: next } : others;
  }, env);
}
