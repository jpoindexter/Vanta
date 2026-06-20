import { appendFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

// Durable registry of named background workers/agents. Append-only JSONL
// (~/.vanta/team.jsonl), global across projects. Latest-write-wins per worker
// id; pure query helpers. The runtime executor is a later slice.

// Tolerant boundary schema: older rows predate the hire fields (adapter,
// budgetUsd, title), so those stay OPTIONAL and a row missing them still loads.
// `.passthrough()` keeps any unknown future field rather than dropping the row.
const WorkerSchema = z
  .object({
    kind: z.literal("worker"),
    id: z.string(),
    role: z.string(),
    model: z.string().optional(),
    tools: z.array(z.string()).optional(),
    status: z.enum(["idle", "running", "blocked", "done"]),
    note: z.string().optional(),
    ts: z.string(),
    // Hire fields (PCLIP-AGENT-HIRE) — absent on pre-hire rows.
    adapter: z.string().optional(),
    budgetUsd: z.number().positive().optional(),
    title: z.string().optional(),
  })
  .passthrough();

export type Worker = z.infer<typeof WorkerSchema>;

function teamPath(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "team.jsonl");
}

export async function appendTeam(rec: Worker, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await mkdir(resolveVantaHome(env), { recursive: true });
  await appendFile(teamPath(env), JSON.stringify(rec) + "\n", "utf8");
}

/** Parse one JSONL line through the tolerant schema; null on malformed rows. */
function parseWorkerLine(line: string): Worker | null {
  try {
    const parsed = WorkerSchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : null;
  } catch {
    return null; // not JSON — skip, don't brick the whole read
  }
}

export async function readTeam(env: NodeJS.ProcessEnv = process.env): Promise<Worker[]> {
  try {
    return (await readFile(teamPath(env), "utf8"))
      .split("\n")
      .filter(Boolean)
      .map(parseWorkerLine)
      .filter((w): w is Worker => w !== null);
  } catch {
    return [];
  }
}

/** Latest worker per id (append-only → last write wins). Pure. */
export function latestWorkers(recs: Worker[]): Worker[] {
  const byId = new Map<string, Worker>();
  for (const w of recs) byId.set(w.id, w);
  return [...byId.values()];
}

/** Workers matching a given status. Pure. */
export function byStatus(recs: Worker[], status: Worker["status"]): Worker[] {
  return latestWorkers(recs).filter((w) => w.status === status);
}

/** Workers with status "blocked". Pure. */
export function blocked(recs: Worker[]): Worker[] {
  return byStatus(recs, "blocked");
}
