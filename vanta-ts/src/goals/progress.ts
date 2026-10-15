import type { WorkItem, WorkItemState } from "../work-items/contract.js";

export function goalWorkItemState(
  goalId: number,
  workItems: readonly WorkItem[],
): WorkItemState | undefined {
  const source = `goal:${goalId}`;
  const turnMarker = `:goal:${goalId}:turn:`;
  return workItems
    .filter((item) => item.source === source || item.id.includes(turnMarker))
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .at(-1)?.state;
}
