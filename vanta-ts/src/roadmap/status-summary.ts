import { PARKED_REASON, STATUS, type RoadmapItem } from "./schema.js";

function countBy<T extends string>(items: RoadmapItem[], getKey: (item: RoadmapItem) => T | undefined): Map<T, number> {
  const counts = new Map<T, number>();
  for (const item of items) {
    const key = getKey(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function formatRoadmapStatus(items: RoadmapItem[]): string {
  const statusCounts = countBy(items, (item) => item.status);
  const lines = [
    `total: ${items.length}`,
    ...STATUS.map((status) => `${status}: ${statusCounts.get(status) ?? 0}`),
  ];
  const parked = items.filter((item) => item.status === "parked");
  if (parked.length) {
    const reasonCounts = countBy(parked, (item) => item.parkedReason ?? "review");
    lines.push(
      "parked reasons:",
      ...PARKED_REASON
        .filter((reason) => (reasonCounts.get(reason) ?? 0) > 0)
        .map((reason) => `- ${reason}: ${reasonCounts.get(reason) ?? 0}`),
    );
  }
  return lines.join("\n");
}
