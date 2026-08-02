import type { WorkItem } from "./contract.js";
import { WorkItemSchema } from "./contract.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type WorkItemProjection = { items: WorkItem[]; invalidRows: number };

export async function readWorkItemProjection(root: string): Promise<WorkItemProjection> {
  let raw: string;
  try {
    raw = await readFile(join(root, ".vanta", "work-items.jsonl"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { items: [], invalidRows: 0 };
    return { items: [], invalidRows: 1 };
  }
  const latest = new Map<string, WorkItem>();
  let invalidRows = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let parsed;
    try {
      parsed = WorkItemSchema.safeParse(JSON.parse(line));
    } catch {
      invalidRows++;
      continue;
    }
    if (!parsed.success) {
      invalidRows++;
      continue;
    }
    const current = latest.get(parsed.data.id);
    if (!current || current.updatedAt <= parsed.data.updatedAt) latest.set(parsed.data.id, parsed.data);
  }
  return { items: [...latest.values()], invalidRows };
}
