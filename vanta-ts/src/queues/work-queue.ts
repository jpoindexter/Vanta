import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

// PCLIP-WORK-QUEUES — continuous routing for repeatable inputs. A named queue
// carries an ASSIGNED worker + an instruction template; every pushed input
// becomes a queue item executed through that route — no one-off workflow per
// item. Item storage/claiming reuses the runner's atomic-claim primitives
// (subdir "work-queues/<name>"); this module owns the queue configs + routing.

export const WorkQueueSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "queue names are kebab-case slugs"),
  /** Team-roster worker every item routes to. */
  workerId: z.string().min(1),
  /** Instruction template; `{input}` is replaced with the pushed input. */
  template: z.string().default("{input}"),
  created: z.string(),
});
export type WorkQueue = z.infer<typeof WorkQueueSchema>;

export function queueSubdir(name: string): string {
  return join("work-queues", name);
}

function configPath(dataDir: string, name: string): string {
  return join(dataDir, "work-queues", `${name}.json`);
}

/** Define (or redefine) a named queue. */
export async function defineQueue(
  dataDir: string,
  opts: { name: string; workerId: string; template?: string; now?: Date },
): Promise<WorkQueue | { error: string }> {
  const parsed = WorkQueueSchema.safeParse({
    name: opts.name,
    workerId: opts.workerId,
    template: opts.template,
    created: (opts.now ?? new Date()).toISOString(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "invalid queue definition" };
  await mkdir(join(dataDir, "work-queues"), { recursive: true });
  await writeFile(configPath(dataDir, parsed.data.name), `${JSON.stringify(parsed.data, null, 2)}\n`, "utf8");
  return parsed.data;
}

/** Load one queue config; null when undefined. */
export async function loadQueue(dataDir: string, name: string): Promise<WorkQueue | null> {
  try {
    const parsed = WorkQueueSchema.safeParse(JSON.parse(await readFile(configPath(dataDir, name), "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** All defined queues (config files only, not item dirs). */
export async function listQueues(dataDir: string): Promise<WorkQueue[]> {
  try {
    const files = (await readdir(join(dataDir, "work-queues"))).filter((f) => f.endsWith(".json")).sort();
    const out: WorkQueue[] = [];
    for (const f of files) {
      const q = await loadQueue(dataDir, f.replace(/\.json$/, ""));
      if (q) out.push(q);
    }
    return out;
  } catch {
    return [];
  }
}

/** Render a queue item's instruction from the template. Pure. */
export function renderInstruction(queue: WorkQueue, input: string): string {
  return queue.template.includes("{input}") ? queue.template.replaceAll("{input}", input) : `${queue.template}\n\n${input}`;
}
