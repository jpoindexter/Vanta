import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RoadmapSchema } from "./schema.js";
import type { RoadmapItem, Status } from "./schema.js";
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

type MoveOptions = { force?: boolean };

function openDependencies(items: RoadmapItem[], item: RoadmapItem): string[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return (item.after ?? []).flatMap((id) => {
    const dep = byId.get(id);
    return dep?.status === "shipped" ? [] : [`${id} (${dep?.status ?? "missing"})`];
  });
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

  const deps = toStatus === "building" && !options.force ? openDependencies(data.items, item) : [];
  if (deps.length) throw new RoadmapDependencyError(id, deps);

  const violation = checkWipLimit(data.items, id, toStatus);
  if (violation) throw violation;

  const fromStatus = item.status;
  item.status = toStatus;
  const originalItem = original.items.find((candidate) => candidate.id === id);
  if (!originalItem) throw new Error(`no item with id '${id}' in roadmap.json`);
  originalItem.status = toStatus;
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
