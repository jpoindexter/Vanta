import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RoadmapSchema } from "./schema.js";
import type { ParkedReason, RoadmapItem, Status } from "./schema.js";
import { buildRoadmap } from "./build.js";
import { checkWipLimit } from "./wip.js";
import { appendVelocityEvent } from "../velocity/store.js";
import type { ExternalProofGate } from "./external-proof.js";
export { WipLimitError } from "./wip.js";

export class RoadmapDependencyError extends Error {
  constructor(public itemId: string, public openDependencies: string[]) {
    super(`open dependencies for ${itemId}: ${openDependencies.join(", ")}. Move dependencies to shipped first, or retry with --force.`);
    this.name = "RoadmapDependencyError";
  }
}

export class RoadmapParkedReviveError extends Error {
  constructor(public itemId: string, public parkedReason: ParkedReason) {
    super(`parked card ${itemId} requires review before revival (${parkedReason}). Run \`vanta roadmap unblock ${itemId}\`, then retry with --force if the reason is no longer true.`);
    this.name = "RoadmapParkedReviveError";
  }
}

export class RoadmapProofGateError extends Error {
  constructor(public itemId: string, public evidence: string, public receiptPath?: string) {
    super(`proof gate failed for ${itemId}: ${evidence}${receiptPath ? ` (receipt: ${receiptPath})` : ""}`);
    this.name = "RoadmapProofGateError";
  }
}

type MoveOptions = {
  force?: boolean;
  acceptExternalProof?: boolean;
  requireShippedDependencies?: boolean;
};

function openDependencies(items: RoadmapItem[], item: RoadmapItem): string[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return (item.after ?? []).flatMap((id) => {
    const dep = byId.get(id);
    return dep?.status === "shipped" ? [] : [`${id} (${dep?.status ?? "missing"})`];
  });
}

function parkedReviveError(item: RoadmapItem, toStatus: Status, force?: boolean): RoadmapParkedReviveError | null {
  if (force || item.status !== "parked" || toStatus === "parked" || toStatus === "shipped") return null;
  return new RoadmapParkedReviveError(item.id, item.parkedReason ?? "review");
}

function parkedShipError(item: RoadmapItem, toStatus: Status, acceptExternalProof?: boolean): RoadmapParkedReviveError | null {
  if (item.status !== "parked" || toStatus !== "shipped") return null;
  if (acceptExternalProof && item.parkedReason === "external proof") return null;
  return new RoadmapParkedReviveError(item.id, item.parkedReason ?? "review");
}

function assertParkedReviveAllowed(item: RoadmapItem, toStatus: Status, options: MoveOptions): void {
  const shipped = parkedShipError(item, toStatus, options.acceptExternalProof);
  if (shipped) throw shipped;
  const revive = parkedReviveError(item, toStatus, options.force);
  if (revive) throw revive;
}

async function externalProofGate(repoRoot: string, item: RoadmapItem, toStatus: Status): Promise<ExternalProofGate | null> {
  if (toStatus !== "shipped") return null;
  const { readExternalProofReadiness } = await import("./external-proof.js");
  const readiness = await readExternalProofReadiness(repoRoot);
  const gate = readiness.gates.find((candidate) => candidate.roadmapCardId === item.id);
  if (!gate) return null;
  if (!gate.ready) throw new RoadmapProofGateError(item.id, gate.evidence, gate.receiptPath);
  return gate;
}

function assertDependenciesAllowed(items: RoadmapItem[], item: RoadmapItem, toStatus: Status, options: MoveOptions): void {
  const check = (toStatus === "building" && !options.force) || options.requireShippedDependencies;
  const deps = check ? openDependencies(items, item) : [];
  if (deps.length) throw new RoadmapDependencyError(item.id, deps);
}

function assertWipAllowed(items: RoadmapItem[], id: string, toStatus: Status): void {
  const violation = checkWipLimit(items, id, toStatus);
  if (violation) throw violation;
}

function applyStatusMetadata(item: RoadmapItem, toStatus: Status): void {
  item.status = toStatus;
  if (toStatus === "parked" && !item.parkedReason) item.parkedReason = "review";
  if (toStatus !== "parked") delete item.parkedReason;
}

function applyRawStatusMetadata(item: Record<string, unknown>, toStatus: Status): void {
  item.status = toStatus;
  if (toStatus === "parked" && typeof item.parkedReason !== "string") item.parkedReason = "review";
  if (toStatus !== "parked") delete item.parkedReason;
}

function proofNote(gate: ExternalProofGate): string {
  return `EXTERNAL PROOF ACCEPTED ${new Date().toISOString()}: ${gate.label}; receipt ${gate.receiptPath}; ${gate.evidence}`;
}

function appendProofMetadata(item: RoadmapItem | Record<string, unknown>, gate: ExternalProofGate): void {
  const note = proofNote(gate);
  item.notes = typeof item.notes === "string" && item.notes ? `${item.notes}\n\n${note}` : note;
}

export async function moveRoadmapItem(
  repoRoot: string,
  id: string,
  toStatus: Status,
  options: MoveOptions = {},
): Promise<RoadmapItem> {
  const src = join(repoRoot, "roadmap.json");
  const raw = await readFile(src, "utf8");
  const original = JSON.parse(raw) as { updated: string; items: Array<Record<string, unknown>> };
  const data = RoadmapSchema.parse(original);

  const item = data.items.find((i) => i.id === id);
  if (!item) {
    throw new Error(`no item with id '${id}' in roadmap.json`);
  }

  assertParkedReviveAllowed(item, toStatus, options);
  const proofGate = await externalProofGate(repoRoot, item, toStatus);
  assertDependenciesAllowed(data.items, item, toStatus, options);
  assertWipAllowed(data.items, id, toStatus);

  const fromStatus = item.status;
  applyStatusMetadata(item, toStatus);
  const originalItem = original.items.find((candidate) => candidate.id === id);
  if (!originalItem) throw new Error(`no item with id '${id}' in roadmap.json`);
  applyRawStatusMetadata(originalItem, toStatus);
  if (proofGate) {
    appendProofMetadata(item, proofGate);
    appendProofMetadata(originalItem, proofGate);
  }
  original.updated = new Date().toISOString().slice(0, 10);

  await writeFile(src, JSON.stringify(original, null, 2) + "\n", "utf8");
  await buildRoadmap(repoRoot);

  // Record velocity events best-effort — never fail the move on I/O errors.
  const at = new Date().toISOString();
  if (toStatus === "shipped") {
    appendVelocityEvent(process.env, { type: "ship", itemId: id, at }).catch(() => {});
  }
  if (fromStatus === "horizon" && toStatus !== "horizon") {
    appendVelocityEvent(process.env, { type: "capture", itemId: id, at }).catch(() => {});
  }

  return item;
}
