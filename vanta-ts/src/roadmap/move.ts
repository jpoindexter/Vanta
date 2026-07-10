import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RoadmapSchema } from "./schema.js";
import type { ParkedReason, RoadmapItem, Status } from "./schema.js";
import { buildRoadmap } from "./build.js";
import { checkWipLimit } from "./wip.js";
import { appendVelocityEvent } from "../velocity/store.js";
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

type MoveOptions = { force?: boolean };

function openDependencies(items: RoadmapItem[], item: RoadmapItem): string[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return (item.after ?? []).flatMap((id) => {
    const dep = byId.get(id);
    return dep?.status === "shipped" ? [] : [`${id} (${dep?.status ?? "missing"})`];
  });
}

function parkedReviveError(item: RoadmapItem, toStatus: Status, force?: boolean): RoadmapParkedReviveError | null {
  if (force || item.status !== "parked" || toStatus === "parked") return null;
  return new RoadmapParkedReviveError(item.id, item.parkedReason ?? "review");
}

function parkedShipError(item: RoadmapItem, toStatus: Status): RoadmapParkedReviveError | null {
  if (item.status !== "parked" || toStatus !== "shipped") return null;
  return new RoadmapParkedReviveError(item.id, item.parkedReason ?? "review");
}

function assertParkedReviveAllowed(item: RoadmapItem, toStatus: Status, force?: boolean): void {
  const shipped = parkedShipError(item, toStatus);
  if (shipped) throw shipped;
  const revive = parkedReviveError(item, toStatus, force);
  if (revive) throw revive;
}

async function runAnywhereProofGate(repoRoot: string, item: RoadmapItem, toStatus: Status): Promise<RoadmapProofGateError | null> {
  if (toStatus !== "shipped") return null;
  const ids = new Set(["BACKEND-SERVERLESS-LIVE", "MSG-ADAPTER-TEAMS", "RUN-ANYWHERE-TERMUX", "RUN-ANYWHERE-V1-RELEASE-GATE"]);
  if (!ids.has(item.id)) return null;
  const { readRunAnywhereReadiness } = await import("../run-anywhere/readiness.js");
  const readiness = await readRunAnywhereReadiness(repoRoot);
  if (item.id === "RUN-ANYWHERE-V1-RELEASE-GATE") {
    const missing = readiness.gates.filter((gate) => !gate.ready);
    return missing.length ? new RoadmapProofGateError(item.id, missing.map((gate) => `${gate.roadmapCardId}: ${gate.evidence}`).join("; ")) : null;
  }
  const gate = readiness.gates.find((candidate) => candidate.roadmapCardId === item.id);
  if (!gate?.ready) return new RoadmapProofGateError(item.id, gate?.evidence ?? "no matching readiness gate", gate?.receiptPath);
  return null;
}

function assertDependenciesAllowed(items: RoadmapItem[], item: RoadmapItem, toStatus: Status, force?: boolean): void {
  const deps = toStatus === "building" && !force ? openDependencies(items, item) : [];
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

  assertParkedReviveAllowed(item, toStatus, options.force);

  const proofGate = await runAnywhereProofGate(repoRoot, item, toStatus);
  if (proofGate) throw proofGate;

  assertDependenciesAllowed(data.items, item, toStatus, options.force);
  assertWipAllowed(data.items, id, toStatus);

  const fromStatus = item.status;
  applyStatusMetadata(item, toStatus);
  const originalItem = original.items.find((candidate) => candidate.id === id);
  if (!originalItem) throw new Error(`no item with id '${id}' in roadmap.json`);
  applyRawStatusMetadata(originalItem, toStatus);
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
