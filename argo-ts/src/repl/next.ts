import type { SlashHandler } from "./types.js";

// ND1 — task-initiation affordance. Reads active kernel goals and asks the
// agent for ONE concrete, immediately actionable next micro-step. Returns a
// `resend` so the model answers in the transcript like a normal turn.
export const next: SlashHandler = async (_arg, ctx) => {
  const goals = await ctx.setup.safety.getGoals().catch(() => []);
  const active = goals.filter((g) => g.status === "active");
  if (active.length === 0) {
    return { output: "  no active goals — /goal <text> to set one, then /next" };
  }
  const list = active.map((g, i) => `${i + 1}. ${g.text}`).join("\n");
  return {
    resend: `My active goals:\n${list}\n\nWhat is the single most concrete, immediately actionable next micro-step I should take right now? One action only, ≤ 2 sentences. Name the exact file, command, or decision — no vague guidance.`,
  };
};
