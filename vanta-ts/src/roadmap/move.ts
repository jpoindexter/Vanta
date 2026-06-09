import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RoadmapSchema } from "./schema.js";
import type { RoadmapItem, Status } from "./schema.js";
import { buildRoadmap } from "./build.js";
import { checkWipLimit } from "./wip.js";
import { appendVelocityEvent } from "../velocity/store.js";
export { WipLimitError } from "./wip.js";

export async function moveRoadmapItem(
  repoRoot: string,
  id: string,
  toStatus: Status,
): Promise<RoadmapItem> {
  const src = join(repoRoot, "roadmap.json");
  const raw = await readFile(src, "utf8");
  const data = RoadmapSchema.parse(JSON.parse(raw));

  const item = data.items.find((i) => i.id === id);
  if (!item) {
    throw new Error(`no item with id '${id}' in roadmap.json`);
  }

  const violation = checkWipLimit(data.items, id, toStatus);
  if (violation) throw violation;

  const fromStatus = item.status;
  item.status = toStatus;
  data.updated = new Date().toISOString().slice(0, 10);

  await writeFile(src, JSON.stringify(data, null, 2) + "\n", "utf8");
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
