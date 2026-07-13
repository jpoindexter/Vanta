import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readExternalProofReadiness, type ExternalProofGate } from "./external-proof.js";
import { moveRoadmapItem, RoadmapDependencyError, RoadmapProofGateError } from "./move.js";
import { RoadmapSchema, type RoadmapItem } from "./schema.js";

export type ProofAcceptanceResult = {
  accepted: RoadmapItem[];
  alreadyShipped: string[];
  pending: ExternalProofGate[];
};

export class ExternalProofCardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExternalProofCardError";
  }
}

function unresolvedDependencies(items: Map<string, RoadmapItem>, item: RoadmapItem): string[] {
  return (item.after ?? []).filter((id) => items.get(id)?.status !== "shipped");
}

function selectedGateIds(report: Awaited<ReturnType<typeof readExternalProofReadiness>>, requestedIds: string[], allReady: boolean): string[] {
  return allReady ? report.gates.filter((gate) => gate.ready).map((gate) => gate.roadmapCardId) : [...new Set(requestedIds)];
}

function validateRequest(requestedIds: string[], allReady: boolean, gates: Map<string, ExternalProofGate>): void {
  if (!allReady && requestedIds.length === 0) throw new ExternalProofCardError("provide a roadmap card id or use --all-ready");
  for (const id of requestedIds) {
    if (!gates.has(id)) throw new ExternalProofCardError(`${id} is not a canonical external-proof card`);
  }
}

function validateSelection(selected: string[], gates: Map<string, ExternalProofGate>, items: Map<string, RoadmapItem>): void {
  for (const id of selected) {
    const gate = gates.get(id)!;
    if (!gate.ready) throw new RoadmapProofGateError(id, gate.evidence, gate.receiptPath);
    const item = items.get(id);
    if (!item) throw new ExternalProofCardError(`${id} is missing from roadmap.json`);
    const parkedProof = item.status === "parked" && item.parkedReason === "external proof";
    if (item.status !== "shipped" && !parkedProof) {
      throw new ExternalProofCardError(`${id} must be parked with parkedReason \"external proof\" before acceptance`);
    }
  }
}

function nextAcceptableIndex(waiting: string[], items: Map<string, RoadmapItem>): number {
  return waiting.findIndex((id) => unresolvedDependencies(items, items.get(id)!).length === 0);
}

async function shipSelected(repoRoot: string, selected: string[], items: Map<string, RoadmapItem>): Promise<RoadmapItem[]> {
  const accepted: RoadmapItem[] = [];
  const waiting = selected.filter((id) => items.get(id)?.status !== "shipped");
  while (waiting.length > 0) {
    const index = nextAcceptableIndex(waiting, items);
    if (index < 0) {
      const id = waiting[0]!, item = items.get(id)!;
      const dependencies = unresolvedDependencies(items, item).map((dep) => `${dep} (${items.get(dep)?.status ?? "missing"})`);
      throw new RoadmapDependencyError(id, dependencies);
    }
    const [id] = waiting.splice(index, 1);
    const moved = await moveRoadmapItem(repoRoot, id!, "shipped", { acceptExternalProof: true, requireShippedDependencies: true });
    items.set(id!, moved);
    accepted.push(moved);
  }
  return accepted;
}

export async function acceptExternalProofs(
  repoRoot: string,
  requestedIds: string[],
  allReady = false,
): Promise<ProofAcceptanceResult> {
  const [raw, report] = await Promise.all([
    readFile(join(repoRoot, "roadmap.json"), "utf8"),
    readExternalProofReadiness(repoRoot),
  ]);
  const roadmap = RoadmapSchema.parse(JSON.parse(raw));
  const items = new Map(roadmap.items.map((item) => [item.id, item]));
  const gates = new Map(report.gates.map((gate) => [gate.roadmapCardId, gate]));
  const uniqueIds = [...new Set(requestedIds)];
  validateRequest(uniqueIds, allReady, gates);
  const selected = selectedGateIds(report, uniqueIds, allReady);
  const pending = report.gates.filter((gate) => !gate.ready);
  validateSelection(selected, gates, items);
  const alreadyShipped = selected.filter((id) => items.get(id)?.status === "shipped");
  const accepted = await shipSelected(repoRoot, selected, items);
  return { accepted, alreadyShipped, pending };
}

export function formatProofAcceptance(result: ProofAcceptanceResult): string {
  const lines: string[] = [];
  for (const item of result.accepted) lines.push(`  ✓ Accepted external proof and shipped ${item.id}: ${item.title}`);
  for (const id of result.alreadyShipped) lines.push(`  · ${id} already shipped`);
  if (result.accepted.length === 0 && result.alreadyShipped.length === 0) lines.push("  · No ready external proofs to accept.");
  if (result.pending.length > 0) lines.push(`  · ${result.pending.length} external proof gate(s) still pending.`);
  return lines.join("\n");
}
