// FABRO-MODEL-STYLESHEET: a CSS-like selector map for per-task-class model +
// effort routing. Generalizes the binary cheap/expensive router to N task
// classes, each resolving to a {model, effort, fallback-chain} so the agent can
// automatically fall back to the next entry when a provider errors.
//
// Format (one tiny CSS subset — selector { declarations }):
//   * { model: haiku; reasoning_effort: low }
//   .coding { model: sonnet; reasoning_effort: high }
//
// `*` is the universal rule (the default for any task class). `.<name>` rules
// target a named task class. Declarations: `model` (a VANTA_MODEL value) and
// `reasoning_effort` (one of Vanta's effort levels: low|medium|high|max).
//
// This module is PURE: it parses untrusted env-driven config (validated) and
// resolves a style; it touches no provider and has no side effects.

import { EFFORT_LEVELS, type EffortLevel } from "../types.js";
import { isEffortLevel } from "../effort.js";

/** The resolved style for one task class: a model+effort plus its fallback chain. */
export type ResolvedStyle = {
  /** Model id for the task class (a VANTA_MODEL value). */
  model: string;
  /** Effort level mapped onto Vanta's existing low|medium|high|max levels. */
  effort: EffortLevel;
  /**
   * Ordered fallback chain. The first entry is the resolved (class) rule; later
   * entries are the next styles to try when a provider errors — the universal
   * `*` rule is appended as the last resort when it differs from the class rule.
   */
  fallback: Array<{ model: string; effort: EffortLevel }>;
};

/** One parsed rule: a selector + its declarations. */
type Rule = {
  /** "*" for the universal rule, else the class name (without the dot). */
  selector: string;
  model?: string;
  effort?: EffortLevel;
};

/** A parsed stylesheet: the universal rule (if any) plus class rules by name. */
export type Stylesheet = {
  universal?: Omit<Rule, "selector">;
  classes: Record<string, Omit<Rule, "selector">>;
};

/** Errors-as-values result for parsing untrusted stylesheet config. */
export type ParseResult =
  | { ok: true; stylesheet: Stylesheet }
  | { ok: false; error: string };

const EFFORT_LIST = EFFORT_LEVELS.join(", ");

/**
 * Parse a single `{ ... }` declaration body into model/effort. Errors as values.
 * Unknown declaration keys are ignored (forward-compatible); a malformed effort
 * value is a hard error so a typo never silently routes at the wrong tier.
 */
function parseDeclarations(
  body: string,
  selector: string,
): { ok: true; rule: Omit<Rule, "selector"> } | { ok: false; error: string } {
  const rule: Omit<Rule, "selector"> = {};
  for (const decl of body.split(";")) {
    const trimmed = decl.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon === -1) {
      return { ok: false, error: `${selector}: declaration "${trimmed}" is missing a ":". Use "model: <id>" or "reasoning_effort: <level>".` };
    }
    const key = trimmed.slice(0, colon).trim().toLowerCase();
    const value = trimmed.slice(colon + 1).trim();
    if (!value) return { ok: false, error: `${selector}: "${key}" has no value.` };
    if (key === "model") rule.model = value;
    else if (key === "reasoning_effort" || key === "effort") {
      if (!isEffortLevel(value)) {
        return { ok: false, error: `${selector}: reasoning_effort must be one of: ${EFFORT_LIST}. Got "${value}".` };
      }
      rule.effort = value;
    }
    // Unknown keys are ignored on purpose (forward-compatible declarations).
  }
  return { ok: true, rule };
}

/** Match one `selector { body }` block. `[^{}]` keeps bodies brace-free (flat). */
const RULE_RE = /([^{}]+)\{([^{}]*)\}/g;

/** Merge one parsed rule into the stylesheet under its selector. Errors as values. */
function applyRule(
  stylesheet: Stylesheet,
  selector: string,
  rule: Omit<Rule, "selector">,
): { ok: true } | { ok: false; error: string } {
  if (selector === "*") {
    stylesheet.universal = { ...stylesheet.universal, ...rule };
    return { ok: true };
  }
  if (selector.startsWith(".") && selector.length > 1) {
    const name = selector.slice(1);
    stylesheet.classes[name] = { ...stylesheet.classes[name], ...rule };
    return { ok: true };
  }
  return { ok: false, error: `Unsupported selector "${selector}". Use "*" for the default or ".<task-class>" (e.g. ".coding").` };
}

/**
 * Parse a CSS-like stylesheet string into a {@link Stylesheet}. Pure, validated,
 * errors-as-values. Accepts the universal `*` rule and `.<name>` class rules;
 * any other selector (id, element, combinator) is rejected with a clear message.
 */
export function parseStylesheet(text: string): ParseResult {
  const stylesheet: Stylesheet = { classes: {} };
  let match: RegExpExecArray | null;
  let matched = false;
  RULE_RE.lastIndex = 0;
  while ((match = RULE_RE.exec(text)) !== null) {
    matched = true;
    const selector = (match[1] ?? "").trim();
    const parsed = parseDeclarations(match[2] ?? "", selector || "(empty selector)");
    if (!parsed.ok) return parsed;
    const applied = applyRule(stylesheet, selector, parsed.rule);
    if (!applied.ok) return applied;
  }
  if (!matched && text.trim()) {
    return { ok: false, error: 'No rules found. Expected "selector { declarations }", e.g. "* { model: haiku; reasoning_effort: low }".' };
  }
  return { ok: true, stylesheet };
}

/**
 * Resolve the style for a task class: the class rule layered over the universal
 * `*` rule, with `*` appended as the next fallback entry when it differs. The
 * `defaultEffort` is used only when neither the class nor `*` declared an effort.
 *
 * Returns `null` when no usable model can be resolved (no class rule, no `*`
 * rule) — the caller then preserves its existing non-stylesheet behavior.
 */
export function resolveStyle(
  stylesheet: Stylesheet,
  taskClass: string,
  defaultEffort: EffortLevel = "medium",
): ResolvedStyle | null {
  const universal = stylesheet.universal;
  const cls = stylesheet.classes[taskClass];
  const model = cls?.model ?? universal?.model;
  if (!model) return null;
  const effort = cls?.effort ?? universal?.effort ?? defaultEffort;
  const fallback: ResolvedStyle["fallback"] = [{ model, effort }];
  // Append the universal rule as the last-resort fallback when it points at a
  // different model than the resolved (class) one.
  if (universal?.model && universal.model !== model) {
    fallback.push({ model: universal.model, effort: universal.effort ?? defaultEffort });
  }
  return { model, effort, fallback };
}
