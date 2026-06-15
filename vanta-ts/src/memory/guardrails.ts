import { adjustedConfidence, formatEntry, type BrainEntry } from "../brain/entries.js";

export type MemoryFlag = "stale" | "conflicting" | "weak provenance";
export type GuardedMemory = { entry: BrainEntry; reasons: MemoryFlag[] };
export type MemoryGuardResult = {
  usable: BrainEntry[];
  flagged: GuardedMemory[];
  formatted: string;
};

const DEFAULT_STALE_DAYS = 30;

export function memoryGuardPromptLine(): string {
  return "Memory guardrail: before acting from recalled memory, check freshness/conflict/provenance; flagged memories are hypotheses only, so verify current state before tool calls.";
}

export function guardMemoryRecall(
  entries: BrainEntry[],
  opts: { now?: Date; staleDays?: number } = {},
): MemoryGuardResult {
  const now = opts.now ?? new Date();
  const staleDays = opts.staleDays ?? DEFAULT_STALE_DAYS;
  const guarded = entries.map((entry) => ({ entry, reasons: reasonsFor(entry, now, staleDays) }));
  const usable = guarded.filter((g) => g.reasons.length === 0).map((g) => g.entry);
  const flagged = guarded.filter((g) => g.reasons.length > 0);
  return { usable, flagged, formatted: formatGuarded(usable, flagged) };
}

function reasonsFor(entry: BrainEntry, now: Date, staleDays: number): MemoryFlag[] {
  const reasons: MemoryFlag[] = [];
  if (isStale(entry, now, staleDays)) reasons.push("stale");
  if (entry.contradicts.length > 0 || adjustedConfidence(entry) < 0.5) reasons.push("conflicting");
  if (entry.sourceType === "inference" && !entry.sourceRef) reasons.push("weak provenance");
  return reasons;
}

function isStale(entry: BrainEntry, now: Date, staleDays: number): boolean {
  if (entry.crystalStatus === "crystallized") return false;
  const lastTouch = entry.accessedAt && entry.accessedAt > entry.updatedAt ? entry.accessedAt : entry.updatedAt;
  return (now.getTime() - new Date(lastTouch).getTime()) / 86_400_000 > staleDays;
}

function formatGuarded(usable: BrainEntry[], flagged: GuardedMemory[]): string {
  const header = `Memory guardrails: ${usable.length} usable, ${flagged.length} flagged.`;
  const usableLines = usable.map((entry) => `✓ use ${formatEntry(entry)}`);
  const flaggedLines = flagged.map((g) => `⚠ not used (${g.reasons.join(", ")}) ${formatEntry(g.entry)}`);
  const footer = flagged.length
    ? "Flagged memories are not action evidence; verify current state before acting."
    : "";
  return [header, ...usableLines, ...flaggedLines, footer].filter(Boolean).join("\n");
}
