import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { CronEntry } from "./cron.js";

export type DurableCronEntry = CronEntry & {
  durable: true;
  recurring: boolean;
};

const FILE = "scheduled_tasks.json";

const DurableEntrySchema = z.object({
  id: z.number().int().positive(),
  cron: z.string().min(1),
  instruction: z.string().min(1),
  status: z.enum(["active", "paused"]),
  durable: z.literal(true),
  recurring: z.boolean(),
});

const StoreSchema = z.object({ tasks: z.array(DurableEntrySchema) });

function storePath(dataDir: string): string {
  return join(dataDir, FILE);
}

export async function loadDurableCron(dataDir: string): Promise<DurableCronEntry[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(storePath(dataDir), "utf8"));
    const result = StoreSchema.safeParse(parsed);
    return result.success ? result.data.tasks : [];
  } catch {
    return [];
  }
}

export async function saveDurableCron(dataDir: string, tasks: DurableCronEntry[]): Promise<void> {
  const path = storePath(dataDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ tasks }, null, 2)}\n`, "utf8");
}

export async function addDurableCron(
  dataDir: string,
  cron: string,
  instruction: string,
  recurring: boolean,
): Promise<DurableCronEntry> {
  const tasks = await loadDurableCron(dataDir);
  const nextId = tasks.reduce((max, task) => Math.max(max, task.id), 0) + 1;
  const entry: DurableCronEntry = {
    id: nextId,
    cron,
    instruction,
    status: "active",
    durable: true,
    recurring,
  };
  tasks.push(entry);
  await saveDurableCron(dataDir, tasks);
  return entry;
}
