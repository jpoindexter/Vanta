import { resolveMemoryStore } from "../store/memory-store.js";

// Durable registry of named background workers/agents. Append-only JSONL
// (~/.vanta/team.jsonl), global across projects. Latest-write-wins per worker
// id; pure query helpers. The runtime executor is a later slice.

export type Worker = {
  kind: "worker";
  id: string;
  role: string;
  model?: string;
  tools?: string[];
  status: "idle" | "running" | "blocked" | "done";
  note?: string;
  ts: string;
};

const TEAM_PATH = "team.jsonl";

export async function appendTeam(rec: Worker, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await resolveMemoryStore(env).append(TEAM_PATH, JSON.stringify(rec) + "\n");
}

export async function readTeam(env: NodeJS.ProcessEnv = process.env): Promise<Worker[]> {
  try {
    const raw = await resolveMemoryStore(env).read(TEAM_PATH);
    if (raw === null) return [];
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Worker);
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
