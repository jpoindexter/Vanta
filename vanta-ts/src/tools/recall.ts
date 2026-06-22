import { z } from "zod";
import { join } from "node:path";
import type { Tool, ToolContext } from "./types.js";
import { listSkills, LEARNED_TAG } from "../skills/store.js";
import { searchSkills } from "../skills/recall.js";
import { markVolatile } from "../skills/volatile.js";
import { distilledEnabled, readDistilled } from "../skills/distill.js";
import { recordLearning, type LearningEvent } from "../learning/ledger.js";
import type { Skill } from "../skills/types.js";

/** VANTA-SELF-LEARNING-LOOP: recalling a LEARNED skill IS reuse. Returns the reuse
 *  event to record, or null if the recalled skill wasn't loop-authored. Pure
 *  decision (no query text — describeForSafety forbids echoing the query). */
export function reuseEvent(top: Skill, now: Date = new Date()): LearningEvent | null {
  if (!top.meta.tags?.includes(LEARNED_TAG)) return null;
  return { ts: now.toISOString(), skill: top.meta.name, kind: "reused", adopted: true, reason: "recalled during a task" };
}

/** Fire-and-forget the reuse event to the project ledger (never slows recall). */
function recordReuse(top: Skill, ctx?: ToolContext): void {
  if (!ctx?.root) return;
  const event = reuseEvent(top);
  if (event) void recordLearning(join(ctx.root, ".vanta"), event).catch(() => {});
}

const Args = z.object({ query: z.string().min(1) });

const MAX_MATCHES = 5;

export const recallTool: Tool = {
  schema: {
    name: "recall",
    description:
      "Load the full body of the most relevant learned skill for a task. The skill INDEX " +
      "(names + descriptions) is already in your system prompt; use recall to pull the actual " +
      "step-by-step know-how of one before applying it.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What you need help with — matched against skill names and descriptions.",
        },
      },
      required: ["query"],
    },
  },
  // Constant: never echo the raw query — it can contain words that trip safety triggers.
  describeForSafety: () => "search vanta's skill library",
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'recall needs a "query" string' };
    }
    try {
      const skills = await listSkills();
      const matches = searchSkills(parsed.data.query, skills).slice(0, MAX_MATCHES);
      if (matches.length === 0) {
        return { ok: true, output: "(no matching skills)" };
      }
      // Return the BODY of the best match (on-demand load), plus a short "see also"
      // index of the runner-up matches so the agent can recall a different one.
      const top = matches[0]!.skill;
      recordReuse(top, ctx);
      // Serve the distilled (worked-examples) form when enabled and present — fewer tokens
      // than the full procedural doc (SKILL-DISTILL-EXAMPLES); falls back to the full body.
      let body = top.body.trim();
      if (distilledEnabled()) {
        const distilled = await readDistilled(top.meta.name);
        if (distilled) body = distilled.trim();
      }
      let output = `# ${top.meta.name}\n${top.meta.description}\n\n${body}`;
      const others = matches.slice(1).map((m) => `- ${m.skill.meta.name}: ${m.skill.meta.description}`);
      if (others.length) {
        output += `\n\n---\nOther matches (recall with a more specific query to load one):\n${others.join("\n")}`;
      }
      // Volatile skills are dropped from history after the turn (pruneVolatileSkills).
      if (top.meta.volatile) output = markVolatile(top.meta.name, output);
      return { ok: true, output };
    } catch (err) {
      return { ok: false, output: `recall failed: ${(err as Error).message}` };
    }
  },
};
