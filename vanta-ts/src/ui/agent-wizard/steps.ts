import { z } from "zod";
import type { AgentDefinition } from "../../agentgen/generate.js";
import { slugifySkillName } from "../../store/home.js";

// The pure step state-machine behind the agent-creation wizard. It owns the
// ordered step list, the accumulating draft, per-step validation, and the final
// projection to the {identifier, whenToUse, systemPrompt} shape agentgen writes.
// No React, no IO — the wizard component drives it and renders each step.

/** The ordered wizard steps. The screen order matches this array. */
export const STEP_IDS = [
  "type",
  "description",
  "model",
  "tools",
  "prompt",
  "generate",
  "location",
  "confirm",
] as const;

export type StepId = (typeof STEP_IDS)[number];

/** Human labels for each step (header + progress caption). */
export const STEP_LABELS: Record<StepId, string> = {
  type: "Type",
  description: "Description",
  model: "Model",
  tools: "Tools",
  prompt: "Prompt",
  generate: "Generate",
  location: "Location",
  confirm: "Confirm",
};

/** Where the generated agent file lands. */
export type AgentLocation = "home" | "project";

/**
 * The accumulating wizard draft. Every field starts empty/undefined and is
 * filled as the operator advances. `name` becomes the kebab-case identifier;
 * `systemPrompt` is set by the Generate step (or hand-entered at Prompt).
 */
export type AgentDraft = {
  /** A short type/category label, e.g. "researcher" — seeds the name when blank. */
  type: string;
  /** The plain-English description fed to the generator + used as whenToUse. */
  description: string;
  /** The display name; slugified into the agent identifier. */
  name: string;
  /** Optional model override for the agent (free-form, validated non-empty if set). */
  model: string;
  /** Chosen tool names the agent may use (empty = inherit all). */
  tools: string[];
  /** The system prompt — produced by Generate or typed at the Prompt step. */
  systemPrompt: string;
  /** Where to write the file. */
  location: AgentLocation;
};

/** A fresh, empty draft. */
export function emptyDraft(): AgentDraft {
  return { type: "", description: "", name: "", model: "", tools: [], systemPrompt: "", location: "home" };
}

const NAME_RE = /^[A-Za-z][A-Za-z0-9 _-]*$/;

const DESCRIPTION_MIN = 8;
const VALID_LOCATIONS: readonly AgentLocation[] = ["home", "project"];

// Per-step validators as a lookup table — keeps `canAdvance` a single dispatch
// (low complexity) instead of a long switch with inline boolean expressions.
// Steps absent from the table are always satisfiable (tools/confirm).
const STEP_VALIDATORS: Partial<Record<StepId, (d: AgentDraft) => boolean>> = {
  type: (d) => d.type.trim().length > 0,
  description: (d) => d.description.trim().length >= DESCRIPTION_MIN,
  model: (d) => d.model === d.model.trim(),
  prompt: (d) => NAME_RE.test(d.name.trim()),
  generate: (d) => d.systemPrompt.trim().length > 0,
  location: (d) => VALID_LOCATIONS.includes(d.location),
};

/**
 * Whether the draft satisfies the requirements of `step` — the gate the wizard
 * checks before allowing advance. `generate` only needs a system prompt to
 * exist (the Generate screen fills it); `tools`/`confirm` are always satisfiable.
 */
export function canAdvance(step: StepId, draft: AgentDraft): boolean {
  const validate = STEP_VALIDATORS[step];
  return validate ? validate(draft) : true;
}

/** A short reason a step can't advance, for inline hinting. "" when it can. */
export function blockReason(step: StepId, draft: AgentDraft): string {
  if (canAdvance(step, draft)) return "";
  switch (step) {
    case "type":
      return "Enter a type for the agent.";
    case "description":
      return "Describe the agent in at least 8 characters.";
    case "prompt":
      return "Enter a name (letter first; letters, digits, space, - or _).";
    case "generate":
      return "Generate or enter a system prompt first.";
    default:
      return "This step isn't complete yet.";
  }
}

/** The next step after `step`, or the same step if it's the last one. */
export function nextStep(step: StepId): StepId {
  const i = STEP_IDS.indexOf(step);
  return STEP_IDS[Math.min(i + 1, STEP_IDS.length - 1)] ?? step;
}

/** The previous step before `step`, or the same step if it's the first one. */
export function prevStep(step: StepId): StepId {
  const i = STEP_IDS.indexOf(step);
  return STEP_IDS[Math.max(i - 1, 0)] ?? step;
}

/** True when `step` is the terminal step (Confirm). */
export function isLastStep(step: StepId): boolean {
  return step === STEP_IDS[STEP_IDS.length - 1];
}

/** 1-based position of `step` in the ordered list, for the progress caption. */
export function stepPosition(step: StepId): number {
  return STEP_IDS.indexOf(step) + 1;
}

/** Total number of steps. */
export const STEP_COUNT = STEP_IDS.length;

// draftToDefinition is tolerant of stray name characters: slugifySkillName
// sanitizes the identifier, so we only require a non-blank name here. The
// Prompt step's canAdvance enforces the stricter NAME_RE for live entry.
const DraftCompleteSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().min(1),
  systemPrompt: z.string().min(1),
});

/**
 * Project a completed draft into the AgentDefinition agentgen consumes. The
 * name is slugified into the kebab-case identifier; the description becomes
 * `whenToUse`; the system prompt carries the chosen model/tools as a header so
 * the written file records the operator's selections. Errors-as-values.
 */
export function draftToDefinition(
  draft: AgentDraft,
): { ok: true; def: AgentDefinition } | { ok: false; error: string } {
  const parsed = DraftCompleteSchema.safeParse(draft);
  if (!parsed.success) {
    return { ok: false, error: "draft is missing a name, description, or system prompt" };
  }
  const identifier = slugifySkillName(draft.name);
  return {
    ok: true,
    def: {
      identifier,
      whenToUse: draft.description.trim().slice(0, 400),
      systemPrompt: composePrompt(draft),
    },
  };
}

/** Prepend the operator's model/tools selections to the system prompt body. */
function composePrompt(draft: AgentDraft): string {
  const lines: string[] = [];
  if (draft.model.trim()) lines.push(`Model: ${draft.model.trim()}`);
  if (draft.tools.length > 0) lines.push(`Tools: ${draft.tools.join(", ")}`);
  const header = lines.length > 0 ? `${lines.join("\n")}\n\n` : "";
  return `${header}${draft.systemPrompt.trim()}`;
}
