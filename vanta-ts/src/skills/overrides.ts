import { z } from "zod";

// VANTA-SKILL-OVERRIDE-SETTING — operator-side per-skill visibility overrides.
// This is the SETTINGS-side analogue of the skill-frontmatter-side policy in
// `skills/tool-policy.ts`: where `disableModelInvocation` lets a SKILL AUTHOR keep
// a skill out of the model index, `skillOverrides` lets the OPERATOR (via
// settings.json) hide a noisy skill from the model, hide it from the operator menu,
// or disable it entirely — WITHOUT deleting the skill from disk.
//
// Standalone schema (no import from `settings/store.ts`) so store.ts can fold the
// `SkillOverridesSchema` into `SettingsSchema` without a circular import — mirrors
// how `memory-settings.ts` / `mcp-access.ts` are structured.
//
// Default-safe by design: a skill with NO override is visible to BOTH the model
// index and the operator menu — byte-identical to today's behavior (no override
// can silently hide a skill). The three flags compose:
//   - `disabled`       → hidden from BOTH (a full off switch; wins over the others).
//   - `hiddenFromModel`→ not in the model index, but still in the operator menu.
//   - `hiddenFromMenu` → in the model index, but not in the operator menu.
//
// PURE: a zod schema + four pure resolvers (resolve / visible-to-model /
// visible-in-menu / filter-the-model-list). No I/O, no LLM.
//
// Not wired into the live skill load/index this round (delivered as the pure layer
// + tests). NAMED wire-up point: the SKILL-INDEX in `skills/select.ts`
// `selectSkillsForTask` (where `SkillIndexEntry[]` becomes the model-facing index)
// is where `filterModelSkills(entries.map((e) => e.name), settings.skillOverrides)`
// would drop hidden/disabled skills BEFORE ranking — the same insertion point the
// `tool-policy.ts` `isModelInvocable` filter names. The operator-menu render
// (the `/skills` listing) is the second consumer, gating each row on
// `skillVisibleInMenu`. The kernel `assess()` still gates every tool a skill uses;
// these overrides only narrow which skills the model is offered and which the menu
// shows.

/** One skill's override flags. Every field absent = the all-visible default. */
export const SkillOverrideSchema = z
  .object({
    /** Off switch: hidden from BOTH the model index AND the operator menu. */
    disabled: z.boolean().optional(),
    /** Hidden from the model index only (still selectable in the operator menu). */
    hiddenFromModel: z.boolean().optional(),
    /** Hidden from the operator menu only (still in the model index). */
    hiddenFromMenu: z.boolean().optional(),
  })
  .strict();

export type SkillOverride = z.infer<typeof SkillOverrideSchema>;

/** The operator's per-skill-name override map on settings.json. */
export const SkillOverridesSchema = z.record(SkillOverrideSchema);

export type SkillOverrides = z.infer<typeof SkillOverridesSchema>;

/** The all-visible default returned for a skill with no override (frozen so a
 *  caller can't mutate the shared default). */
const DEFAULT_OVERRIDE: SkillOverride = Object.freeze({});

/**
 * Resolve the override for one skill name, or the all-visible default when the
 * skill has no entry (absent override = visible to both, today's behavior). Pure —
 * reads only the passed name + map. A nullish map is tolerated (treated as empty).
 */
export function resolveSkillOverride(
  skillName: string,
  overrides: SkillOverrides | undefined,
): SkillOverride {
  return overrides?.[skillName] ?? DEFAULT_OVERRIDE;
}

/**
 * Whether the model may see this skill in its prompt index. False when the skill
 * is `disabled` OR `hiddenFromModel`; otherwise true (the default). Pure.
 */
export function skillVisibleToModel(
  skillName: string,
  overrides: SkillOverrides | undefined,
): boolean {
  const o = resolveSkillOverride(skillName, overrides);
  return o.disabled !== true && o.hiddenFromModel !== true;
}

/**
 * Whether the operator menu may list this skill. False when the skill is
 * `disabled` OR `hiddenFromMenu`; otherwise true (the default). Pure.
 */
export function skillVisibleInMenu(
  skillName: string,
  overrides: SkillOverrides | undefined,
): boolean {
  const o = resolveSkillOverride(skillName, overrides);
  return o.disabled !== true && o.hiddenFromMenu !== true;
}

/**
 * Keep only the skill names the model may see: drops every `disabled` or
 * `hiddenFromModel` skill. Preserves input order; an absent override keeps the
 * name (today's behavior — an empty/undefined map returns the list unchanged).
 * Pure; mirrors the allowlist-filter style of `tool-policy.ts`.
 */
export function filterModelSkills(
  skillNames: readonly string[],
  overrides: SkillOverrides | undefined,
): string[] {
  return skillNames.filter((name) => skillVisibleToModel(name, overrides));
}
