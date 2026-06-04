import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { RoadmapSchema } from "../roadmap/schema.js";
import { topNextItems, wasReduced } from "./choice-reduce.js";
import type { SlashHandler } from "./types.js";

// ND1 — task-initiation affordance. Reads active kernel goals and asks the
// agent for ONE concrete, immediately actionable next micro-step. Returns a
// `resend` so the model answers in the transcript like a normal turn.
//
// EF-CHOICEREDUCE: when roadmap.json exists and the "next" queue has > 3
// items, the resend prompt includes only the top 3 (sand/small first) so the
// agent is never asked to reason over a paralysis-inducing backlog.

async function readNextItems(dataDir: string) {
  try {
    const src = join(dirname(dataDir), "roadmap.json");
    const data = RoadmapSchema.parse(JSON.parse(await readFile(src, "utf8")));
    return data.items.filter((i) => i.status === "next");
  } catch {
    return [];
  }
}

export const next: SlashHandler = async (_arg, ctx) => {
  const goals = await ctx.setup.safety.getGoals().catch(() => []);
  const active = goals.filter((g) => g.status === "active");
  if (active.length === 0) {
    return { output: "  no active goals — /goal <text> to set one, then /next" };
  }
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

  return {
    resend:
      `My active goals:\n${list}${backlogSection}\n\n` +
      `What is the single most concrete, immediately actionable next micro-step I should take right now? ` +
      `One action only, ≤ 2 sentences. Name the exact file, command, or decision — no vague guidance.`,
  };
};
