import { BOUNDARY_MARKER, buildBoundaryConfirmation } from "./task-boundary.js";
import type { SlashHandler } from "./types.js";

// EF-TASKBOUNDARY — mark an explicit cognitive task boundary mid-session.
// Unlike /clear (full wipe), /boundary preserves history and injects a visible
// marker + a fresh-context assistant message, preventing prior set from bleeding
// into the new task.

export const boundary: SlashHandler = async (_arg, ctx) => {
  const goals = await ctx.setup.safety.getGoals().catch(() => []);
  const activeGoal = goals.find((g) => g.status === "active") ?? null;

  // Inject the boundary marker as an assistant message so the transcript shows
  // the explicit cognitive-set switch without losing any prior context.
  ctx.convo.messages.push({
    role: "assistant",
    content:
      `${BOUNDARY_MARKER}\n` +
      `[Task boundary — new cognitive set begins here. Prior task context is archived above this line.]`,
  });

  return { output: buildBoundaryConfirmation(activeGoal?.text ?? null) };
};
