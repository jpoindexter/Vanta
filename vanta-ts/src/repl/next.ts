import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { RoadmapSchema } from "../roadmap/schema.js";
import { topNextItems, wasReduced } from "./choice-reduce.js";
import type { ReplCtx, SlashHandler } from "./types.js";

// ND1 — task-initiation affordance. Reads active kernel goals and asks the
// agent for ONE concrete, immediately actionable next micro-step. Returns a
// `resend` so the model answers in the transcript like a normal turn.
//
// EF-CHOICEREDUCE: when roadmap.json exists and the "next" queue has > 3
// items, the resend prompt includes only the top 3 (sand/small first) so the
// agent is never asked to reason over a paralysis-inducing backlog.
//
// GOAL-ACTION reuses buildNextStepResend to auto-fire this same single-micro-step
// prompt when a VAGUE goal is set — without the user typing /next.

async function readNextItems(dataDir: string) {
  try {
    const src = join(dirname(dataDir), "roadmap.json");
    const data = RoadmapSchema.parse(JSON.parse(await readFile(src, "utf8")));
    return data.items.filter((i) => i.status === "next");
  } catch {
    return [];
  }
}

/** Phrasings that signal a goal is too abstract to act on directly. */
const VAGUE_MARKERS = /\b(improve|fix|work on|make better|clean ?up|sort out|deal with|handle|something|stuff|things|better|continue|keep going|finish|complete|everything|all of it|tidy|polish)\b/i;

/**
 * Heuristic: is this goal too vague to act on without first reducing it to a
 * concrete next step? Short goals are vague; longer ones are vague when they
 * carry an abstract marker and NO concrete anchor (a path, code span, #issue,
 * or CARD-ID). Pure — drives GOAL-ACTION's auto-fire. False = leave it alone.
 */
export function isVagueGoal(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.split(/\s+/).length <= 3) return true;
  const hasConcreteAnchor = /[/.]|`|#\d|\b[A-Z]{2,}-[A-Z0-9]+\b/.test(t);
  return VAGUE_MARKERS.test(t) && !hasConcreteAnchor;
}

/**
 * Build the "one concrete next micro-step" resend prompt from active goals +
 * the (choice-reduced) roadmap backlog. Returns null when there are no active
 * goals. Shared by /next and GOAL-ACTION so the two can't drift.
 */
export async function buildNextStepResend(ctx: ReplCtx): Promise<string | null> {
  const goals = await ctx.setup.safety.getGoals().catch(() => []);
  const active = goals.filter((g) => g.status === "active");
  if (active.length === 0) return null;
  const list = active.map((g, i) => `${i + 1}. ${g.text}`).join("\n");

  const allNext = await readNextItems(ctx.dataDir);
  let backlogSection = "";
  if (allNext.length > 0) {
    const visible = topNextItems(allNext);
    const hiddenNote = wasReduced(allNext.length)
      ? ` (${allNext.length - visible.length} more hidden — ship one first to see them)`
      : "";
    const lines = visible.map((i) => `  - [${i.id}] ${i.title} (${i.size}, ${i.tier ?? "pebble"})`);
    backlogSection = `\n\nTop items ready to build${hiddenNote}:\n${lines.join("\n")}`;
  }

  return (
    `My active goals:\n${list}${backlogSection}\n\n` +
    `What is the single most concrete, immediately actionable next micro-step I should take right now? ` +
    `One action only, ≤ 2 sentences. Name the exact file, command, or decision — no vague guidance.`
  );
}

export const next: SlashHandler = async (_arg, ctx) => {
  const resend = await buildNextStepResend(ctx);
  if (!resend) return { output: "  no active goals — /goal <text> to set one, then /next" };
  return { resend };
};
