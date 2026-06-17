import { resolveMemoryStore } from "../store/memory-store.js";

// Vanta's world model — a durable, append-only graph of entities (people,
// projects, repos, companies, goals, accounts, commitments) and relationships.
// Append-only JSONL (principle: durable state over mutable), global (~/.vanta,
// spans projects). Latest-write-wins per entity id; pure query helpers.

export type WorldEntity = {
  kind: "entity";
  id: string;
  type: string;
  name: string;
  note?: string;
  /** 0..1 — how sure Vanta is of this fact. */
  confidence?: number;
  ts: string;
};
export type WorldRelation = { kind: "relation"; from: string; to: string; rel: string; ts: string };
export type WorldRecord = WorldEntity | WorldRelation;

export async function appendWorld(rec: WorldRecord, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const store = resolveMemoryStore(env);
  await store.append("world.jsonl", JSON.stringify(rec) + "\n");
}

export async function readWorld(env: NodeJS.ProcessEnv = process.env): Promise<WorldRecord[]> {
  const store = resolveMemoryStore(env);
  try {
    const raw = await store.read("world.jsonl");
    if (raw === null) return [];
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as WorldRecord);
  } catch {
    return [];
  }
}

const isEntity = (r: WorldRecord): r is WorldEntity => r.kind === "entity";
const isRelation = (r: WorldRecord): r is WorldRelation => r.kind === "relation";

/** Latest entity per id (append-only → last write wins). Pure. */
export function latestEntities(recs: WorldRecord[]): WorldEntity[] {
  const byId = new Map<string, WorldEntity>();
  for (const e of recs.filter(isEntity)) byId.set(e.id, e);
  return [...byId.values()];
}

export function relations(recs: WorldRecord[]): WorldRelation[] {
  return recs.filter(isRelation);
}

/** Entities matching `q` (case-insensitive over type/name/note). Empty q → all. Pure. */
export function queryEntities(recs: WorldRecord[], q: string): WorldEntity[] {
  const t = q.toLowerCase().trim();
  const all = latestEntities(recs);
  if (!t) return all;
  return all.filter((e) => `${e.type} ${e.name} ${e.note ?? ""}`.toLowerCase().includes(t));
}

/** Relations touching an entity id (either end). Pure. */
export function relationsOf(recs: WorldRecord[], id: string): WorldRelation[] {
  return relations(recs).filter((r) => r.from === id || r.to === id);
}
