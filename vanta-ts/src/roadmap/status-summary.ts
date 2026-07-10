import { PARKED_REASON, STATUS, type RoadmapItem } from "./schema.js";

const ACTIVE_STATUS = ["building", "blocked", "next", "horizon"] as const;
const TERMINAL_PARKED_REASON = ["declined/n-a", "duplicate", "optional proof"] as const;
type CountSummary<T extends string> = Record<T, number>;

export type RoadmapStatusSummary = {
  total: number;
  activeTotal: number;
  activeDrained: boolean;
  complete: boolean;
  nonShippedTotal: number;
  openTotal: number;
  terminalParkedTotal: number;
  statuses: CountSummary<RoadmapItem["status"]>;
  parkedReasons: CountSummary<(typeof PARKED_REASON)[number]>;
};

export type RoadmapOpenItem = {
  id: string;
  title: string;
  status: RoadmapItem["status"];
  parkedReason?: RoadmapItem["parkedReason"];
};

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
  const summary = summarizeRoadmapStatus(items);
  const lines = [
    `total: ${summary.total}`,
    ...STATUS.map((status) => `${status}: ${summary.statuses[status]}`),
  ];
  if (summary.statuses.parked > 0) {
    lines.push(
      "parked reasons:",
      ...PARKED_REASON
        .filter((reason) => summary.parkedReasons[reason] > 0)
        .map((reason) => `- ${reason}: ${summary.parkedReasons[reason]}`),
    );
  }
  return lines.join("\n");
}

export function activeRoadmapCount(items: RoadmapItem[]): number {
  return items.filter((item) => (ACTIVE_STATUS as readonly string[]).includes(item.status)).length;
}

export function nonShippedRoadmapCount(items: RoadmapItem[]): number {
  return items.filter((item) => item.status !== "shipped").length;
}

function isTerminalParked(item: RoadmapItem): boolean {
  return item.status === "parked" && (TERMINAL_PARKED_REASON as readonly string[]).includes(item.parkedReason ?? "review");
}

export function openRoadmapItems(items: RoadmapItem[]): RoadmapOpenItem[] {
  return items
    .filter((item) => item.status !== "shipped" && !isTerminalParked(item))
    .map((item) => ({ id: item.id, title: item.title, status: item.status, parkedReason: item.parkedReason }));
}

export function summarizeRoadmapStatus(items: RoadmapItem[]): RoadmapStatusSummary {
  const statusCounts = countBy(items, (item) => item.status);
  const parked = items.filter((item) => item.status === "parked");
  const reasonCounts = countBy(parked, (item) => item.parkedReason ?? "review");
  const statuses = Object.fromEntries(STATUS.map((status) => [status, statusCounts.get(status) ?? 0])) as CountSummary<RoadmapItem["status"]>;
  const parkedReasons = Object.fromEntries(PARKED_REASON.map((reason) => [reason, reasonCounts.get(reason) ?? 0])) as CountSummary<(typeof PARKED_REASON)[number]>;
  const activeTotal = ACTIVE_STATUS.reduce((sum, status) => sum + statuses[status], 0);
  const nonShippedTotal = items.length - statuses.shipped;
  const terminalParkedTotal = items.filter(isTerminalParked).length;
  const openTotal = nonShippedTotal - terminalParkedTotal;
  return { total: items.length, activeTotal, activeDrained: activeTotal === 0, complete: openTotal === 0, nonShippedTotal, openTotal, terminalParkedTotal, statuses, parkedReasons };
}

export function formatRoadmapDrainGate(items: RoadmapItem[]): string {
  const summary = summarizeRoadmapStatus(items);
  const lines = [
    `active roadmap drained: ${summary.activeDrained ? "yes" : "no"}`,
    ...ACTIVE_STATUS.map((status) => `${status}: ${summary.statuses[status]}`),
  ];
  const parked = summary.statuses.parked;
  if (parked) lines.push(`parked: ${parked}`, "parked cards require proof/decision before revival");
  return lines.join("\n");
}

export function formatRoadmapCompletionGate(items: RoadmapItem[]): string {
  const summary = summarizeRoadmapStatus(items);
  const lines = [
    `roadmap complete: ${summary.complete ? "yes" : "no"}`,
    `shipped: ${summary.statuses.shipped}/${summary.total}`,
    `open: ${summary.openTotal}`,
    `non-shipped: ${summary.nonShippedTotal}`,
    `terminal parked: ${summary.terminalParkedTotal}`,
    ...STATUS.filter((status) => status !== "shipped").map((status) => `${status}: ${summary.statuses[status]}`),
  ];
  const parked = summary.statuses.parked;
  if (summary.openTotal) lines.push("open parked cards still require proof/decision before completion");
  if (parked) lines.push("use `vanta roadmap unblock` for proof/decision steps");
  return lines.join("\n");
}

export function formatRoadmapOpenWork(items: RoadmapItem[]): string {
  const open = openRoadmapItems(items);
  if (open.length === 0) return "No open roadmap work remains.";
  return [
    `open roadmap work: ${open.length}`,
    ...open.map((item) => {
      const state = [item.status, item.parkedReason].filter(Boolean).join(" · ");
      return `- ${item.id} (${state}) - ${item.title}`;
    }),
  ].join("\n");
}
