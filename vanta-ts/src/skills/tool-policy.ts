// SKILL-TOOL-POLICY — two pure skill-frontmatter policies, parsed off a raw
// frontmatter object (NOT SkillMeta — `skills/frontmatter.ts` parseMeta drops
// unknown keys, so these fields never survive into the closed SkillMeta shape;
// the parser here reads the raw YAML record directly):
//   1. `allowedTools` — the tool names a skill restricts ITSELF to while active.
//      Absent / non-array / garbage => unrestricted (every tool stays).
//   2. `disableModelInvocation` — the skill is operator-invoke-only and is NEVER
//      auto-selected by the model into the skill index. Absent / non-true => the
//      skill stays model-selectable (current behavior).
//
// PURE: a parser + a tool filter + an eligibility check. No I/O, no LLM. Mirrors
// the allowlist-intersection style of `subagent/builtin-agents.ts` agentToolFilter
// (order-preserving, deduped, never grants an absent tool).
//
// Not wired into the live skill load/index this round (delivered as the pure layer
// + tests). NAMED wire-up points (mirrors how coordinator-mode / builtin-agents
// name their consumers — the kernel still gates every tool call; these only narrow
// which tools a skill is offered and which skills the model can pick):
//   1. SKILL-INDEX (`skills/select.ts` selectSkillsForTask, where SkillIndexEntry[]
//      becomes the model-facing index): drop any entry whose policy fails
//      `isModelInvocable(policy)` BEFORE ranking, so a `disableModelInvocation`
//      skill never enters the model-facing index (it stays reachable via the
//      `recall` tool / explicit operator invoke).
//   2. ACTIVE-SKILL-TOOL-SCOPE (the place the active skill's tool set is computed —
//      alongside the per-turn registry, mirroring coordinator-mode's
//      buildRegistry({exclude}) consumer): compute the offered tool names with
//      `skillAllowedToolNames(policy, registry.list().map((t) => t.name))` and pass
//      the complement as `exclude` while that skill is active.

/**
 * A skill's tool-and-invocation policy, parsed from its frontmatter.
 *
 * `allowedTools` absent (undefined) = UNRESTRICTED (the skill may use every tool).
 * An empty array is meaningful and distinct: the skill restricts itself to NO
 * tools. `disableModelInvocation` true = operator-invoke-only (kept out of the
 * model-facing skill index); false (the default) = model-selectable.
 */
export type SkillToolPolicy = {
  /** Allowlist of tool names the skill confines itself to; undefined = all tools. */
  readonly allowedTools?: readonly string[];
  /** True = never auto-selected by the model into the skill index. */
  readonly disableModelInvocation: boolean;
};

/**
 * Coerce a raw frontmatter `allowedTools` value into a clean string allowlist, or
 * `undefined` (unrestricted) when the field is absent or not a usable array.
 *
 * Tolerant by design (it's an LLM/author boundary): a non-array (string, number,
 * object, null) => `undefined` (treated as unset, i.e. unrestricted — NOT an empty
 * allowlist, so garbage never silently strips every tool). Within a real array,
 * non-string and blank entries are dropped and the rest are trimmed + deduped,
 * preserving first-seen order. Tool names are matched case-sensitively (registry
 * names are lower_snake_case, e.g. `read_file`); entries are NOT lowered, so a
 * mis-cased name simply fails to intersect rather than being silently rewritten.
 */
function parseAllowedTools(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const name = raw.trim();
    if (name.length === 0 || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/**
 * Coerce a raw frontmatter `disableModelInvocation` value into a strict boolean.
 * Tolerant of the flat-YAML string form: only the literal boolean `true` or the
 * string `"true"` (any case, trimmed) disables invocation. Anything else —
 * absent, `false`, `"false"`, a non-boolean, garbage — leaves the skill
 * model-invocable (the default, current behavior).
 */
function parseDisableModelInvocation(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
}

/**
 * Parse a {@link SkillToolPolicy} from a raw parsed-frontmatter object (the YAML
 * record, e.g. `{ name, description, allowedTools, disableModelInvocation, … }`).
 * Defaults are unchanged-behavior: no `allowedTools` => unrestricted, and
 * `disableModelInvocation` => false. Tolerant — a missing/garbage field falls
 * back to its default rather than throwing. Pure.
 */
export function parseSkillToolPolicy(frontmatter: Record<string, unknown>): SkillToolPolicy {
  return {
    allowedTools: parseAllowedTools(frontmatter.allowedTools),
    disableModelInvocation: parseDisableModelInvocation(frontmatter.disableModelInvocation),
  };
}

/**
 * The tool names a skill is permitted to use while active: the present tool names
 * intersected with the policy's `allowedTools` (when set), else every present
 * name. Order follows `allToolNames` (deduped), and an allowlisted-but-absent tool
 * is a no-op — a name is granted ONLY if it is actually present, so the policy can
 * never conjure a tool the registry doesn't have. An empty `allowedTools` yields []
 * (the skill is confined to no tools). Pure; mirrors agentToolFilter.
 */
export function skillAllowedToolNames(
  policy: SkillToolPolicy,
  allToolNames: readonly string[],
): string[] {
  const allow = policy.allowedTools;
  const allowSet = allow === undefined ? null : new Set(allow);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of allToolNames) {
    if (seen.has(name)) continue;
    if (allowSet !== null && !allowSet.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/**
 * Whether the model may auto-select this skill into its index. The inverse of
 * `disableModelInvocation`: a skill that disabled model invocation is
 * operator-invoke-only and returns false here (so SKILL-INDEX drops it); every
 * other skill returns true (model-selectable, current behavior). Pure.
 */
export function isModelInvocable(policy: SkillToolPolicy): boolean {
  return !policy.disableModelInvocation;
}
