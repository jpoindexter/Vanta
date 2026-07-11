const WORKFLOW_DRAFT = /\b(?:draft|design|create|compose|build)\b[^.!?\n]{0,120}\bworkflow\b|\bworkflow\b[^.!?\n]{0,120}\b(?:draft|design|create|compose|build)\b/i;

/** One bounded retry instruction when an explicit task requires a specialized tool. */
export function requiredToolNudge(userText: string, availableTools: string[], usedTools: string[]): string | null {
  if (!WORKFLOW_DRAFT.test(userText)) return null;
  if (!availableTools.includes("compose_workflow") || usedTools.includes("compose_workflow")) return null;
  return "Before answering, use compose_workflow with mode=validate to validate the review-only workflow graph. Do not run or deploy it; preserve every approval and no-action constraint from the user. In the final response, map each acceptance criterion named by the user to specific validated graph evidence from a node, instruction, or transition, and say when a criterion was not validated. A title or restatement of the requested intent is not evidence; encode operational requirements such as schedules in the graph itself.";
}
