import { serializeSkill } from "../skills/frontmatter.js";
import { slugifySkillName } from "../store/home.js";
import { lastIntent } from "./where.js";
import type { Skill } from "../skills/types.js";
import type { Message } from "../types.js";
import type { SlashHandler } from "./types.js";

// VANTA-SKILLIFY — distill the current session into a draft SKILL.md so a
// repeated workflow becomes a reusable skill. The distill (frontmatter + body
// from the transcript) is PURE; the actual write is NOT done here — it's named
// (`write_skill`) and offered to the operator, never auto-written.

/** Raw session signal the distiller turns into a skill draft. */
export type SkillifyInput = {
  /** Explicit skill name from the command arg (slugified). Optional. */
  name?: string;
  /** The first user goal — the description + name fallback source. */
  firstUserGoal?: string;
  /** The ordered tool/action names used this session. */
  toolSequence: string[];
  /** Extra named key actions to fold into the procedure (optional). */
  keyActions?: string[];
};

/** A distilled skill draft: the three SKILL.md surfaces (no I/O performed). */
export type SkillDraft = {
  name: string;
  description: string;
  body: string;
};

/** The marker returned when a session has nothing worth distilling yet. */
export const NOTHING_TO_SKILLIFY = "nothing to skillify yet";

// Control chars: C0 (U+0000-001F), DEL (U+007F), and C1 (U+0080-009F).
// Stripped so a transcript with terminal escapes never leaks into the draft.
// eslint-disable-next-line no-control-regex -- intentional control-char strip
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/g;

/** Strip control chars and collapse whitespace to one line. */
function controlStrip(s: string): string {
  return s.replace(CONTROL_RE, " ").replace(/\s+/g, " ").trim();
}

/** Drop consecutive duplicates from an ordered list (keeps non-adjacent repeats). */
function dedupeConsecutive(items: string[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (item !== out[out.length - 1]) out.push(item);
  }
  return out;
}

/** Resolve the skill name: explicit arg → goal slug → "unnamed-skill". */
function resolveName(input: SkillifyInput): string {
  const fromArg = input.name?.trim();
  if (fromArg) return slugifySkillName(fromArg);
  const goal = controlStrip(input.firstUserGoal ?? "");
  return goal ? slugifySkillName(goal) : "unnamed-skill";
}

/** One-line description from the goal, or a sensible default when absent. */
function resolveDescription(goal: string): string {
  return goal || "A reusable workflow captured from a Vanta session.";
}

/** Build the markdown procedure body: the goal + the ordered distinct steps. */
function buildBody(goal: string, steps: string[]): string {
  const lines: string[] = ["## Goal", "", goal || "(no goal recorded)", "", "## Procedure", ""];
  if (steps.length) {
    steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  } else {
    lines.push(`(${NOTHING_TO_SKILLIFY} — no actions recorded this session)`);
  }
  return lines.join("\n");
}

/**
 * Distill raw session signal into a skill draft. Pure. The name comes from the
 * arg (slugified) or a slug of the goal; the description is a one-line from the
 * goal; the body is a markdown procedure of the goal plus the ordered DISTINCT
 * tool/action steps (consecutive duplicates collapsed). Control chars stripped.
 */
export function distillSkillDraft(input: SkillifyInput): SkillDraft {
  const goal = controlStrip(input.firstUserGoal ?? "");
  const rawSteps = [...input.toolSequence, ...(input.keyActions ?? [])]
    .map((s) => controlStrip(s))
    .filter((s) => s.length > 0);
  const steps = dedupeConsecutive(rawSteps);
  return {
    name: resolveName(input),
    description: resolveDescription(goal),
    body: buildBody(goal, steps),
  };
}

/** Render a draft to a full SKILL.md string (valid frontmatter + body) via serializeSkill. */
export function buildSkillifyContent(draft: SkillDraft, now: Date = new Date()): string {
  const when = now.toISOString();
  const skill: Skill = {
    meta: {
      name: draft.name,
      description: draft.description,
      created: when,
      updated: when,
      tags: ["vanta-skillify"],
    },
    body: draft.body,
  };
  return serializeSkill(skill);
}

/** Read the first user goal from the conversation transcript (skips the system msg). */
function firstUserGoal(messages: Message[]): string {
  for (const m of messages) {
    if (m.role === "user" && m.content.trim()) return m.content.trim();
  }
  return "";
}

/** Read the ordered tool-call names across the whole conversation. */
function toolSequence(messages: Message[]): string[] {
  const names: string[] = [];
  for (const m of messages) {
    if (m.role === "assistant" && m.toolCalls?.length) {
      for (const tc of m.toolCalls) names.push(tc.name);
    }
  }
  return names;
}

/**
 * /skillify [name] — distill the current session into a draft SKILL.md.
 * Reads the goal + tool sequence from the live conversation, returns the draft
 * (name + description + body) plus a note that `write_skill` will save it. Does
 * NOT auto-write — the write is offered, operator-confirmed.
 */
export const skillify: SlashHandler = (arg, ctx) => {
  const messages = ctx.convo.messages;
  const goal = firstUserGoal(messages) || lastIntent(messages);
  const draft = distillSkillDraft({
    name: arg.trim() || undefined,
    firstUserGoal: goal,
    toolSequence: toolSequence(messages),
  });
  const hasContent = goal.trim().length > 0 || toolSequence(messages).length > 0;
  const note = hasContent
    ? `  · run write_skill (name "${draft.name}") to save this — it is not written automatically`
    : `  · ${NOTHING_TO_SKILLIFY} — keep working, then /skillify again to capture the procedure`;
  const preview = buildSkillifyContent(draft, ctx.now());
  return { output: `\n${preview}\n\n${note}` };
};
