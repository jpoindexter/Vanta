const DESTRUCTIVE = /\b(delete|drop|remove|overwrite|reset|truncate|purge|wipe|rm\s|unlink)\b/i;
const ADDITIVE = /\b(add|build|implement|create|ship|deploy|install|write|scaffold|generate)\b/i;

/** True when the action description contains destructive keywords. */
export function isDestructiveAction(description: string): boolean {
  return DESTRUCTIVE.test(description);
}

/** True when the active goal text contains additive verbs. */
export function isAdditiveGoal(goalText: string): boolean {
  return ADDITIVE.test(goalText);
}

/** True when the action is destructive and the stated goal is additive — a likely mismatch. */
export function shouldWarn(actionDescription: string, activeGoalText: string | undefined): boolean {
  if (!activeGoalText) return false;
  return isDestructiveAction(actionDescription) && isAdditiveGoal(activeGoalText);
}

export function buildSelfMonitorText(toolName: string, _goalText: string): string {
  return `⚠ Self-monitor: \`${toolName}\` looks destructive but goal is additive. Proceeding — verify this is correct.`;
}
