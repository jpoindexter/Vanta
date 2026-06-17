import { createHash } from "node:crypto";
import { resolveMemoryStore } from "../store/memory-store.js";

// MEM-GRAPH: Temporal entity-relationship graph — entity × relationship model
// stored as append-only JSONL. Enables cross-session queries: what goals mention
// tool X, what did we decide about Y last week, which projects share a tool.

export type EntityType = "person" | "project" | "tool" | "decision" | "goal" | "concept" | "file";
export type RelationType = "worked-on" | "decided" | "depends-on" | "related-to" | "learned" | "part-of" | "uses";

export type GraphEntity = { kind: "entity"; id: string; name: string; type: EntityType; ts: string };
export type GraphRelation = { kind: "relation"; id: string; from: string; to: string; rel: RelationType; ts: string; strength: number };
export type GraphRecord = GraphEntity | GraphRelation;

export type QueryResult = {
  entity: GraphEntity;
  relations: Array<{ rel: RelationType; target: GraphEntity; strength: number; ts: string }>;
};

const GRAPH_PATH = "graph.jsonl";

function entityId(name: string, type: EntityType): string {
  return createHash("sha256").update(`${type}:${name.toLowerCase().trim()}`).digest("hex").slice(0, 12);
}

/** Append one or more graph records. Creates the file if absent. */
export async function appendGraph(records: GraphRecord[], env?: NodeJS.ProcessEnv): Promise<void> {
  const lines = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  await resolveMemoryStore(env).append(GRAPH_PATH, lines);
}

/** Upsert an entity (idempotent by name+type). Returns the entity. */
export function makeEntity(name: string, type: EntityType, ts = new Date().toISOString()): GraphEntity {
  return { kind: "entity", id: entityId(name, type), name, type, ts };
}

/** Create a directed relation between two entities. */
export function makeRelation(
  from: GraphEntity,
  to: GraphEntity,
  rel: RelationType,
  opts: { strength?: number; ts?: string } = {},
): GraphRelation {
  const strength = opts.strength ?? 0.5;
  const ts = opts.ts ?? new Date().toISOString();
  const id = createHash("sha256").update(`${from.id}:${rel}:${to.id}`).digest("hex").slice(0, 12);
  return { kind: "relation", id, from: from.id, to: to.id, rel, ts, strength };
}

/** Load all graph records from disk. */
async function loadGraph(env?: NodeJS.ProcessEnv): Promise<GraphRecord[]> {
  const raw = (await resolveMemoryStore(env).read(GRAPH_PATH)) ?? "";
  return raw
    .split("\n")
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l) as GraphRecord; } catch { return null; } })
    .filter((r): r is GraphRecord => r !== null);
}

/**
 * Search the graph for entities matching `query` (name substring, case-insensitive).
 * Returns up to `maxResults` entities with their direct relations.
 */
export async function graphQuery(
  query: string,
  opts: { env?: NodeJS.ProcessEnv; maxResults?: number; type?: EntityType } = {},
): Promise<QueryResult[]> {
  const records = await loadGraph(opts.env);
  const kw = query.toLowerCase();
  const maxResults = opts.maxResults ?? 10;

  // Index entities and relations
  const entities = new Map<string, GraphEntity>();
  const relations: GraphRelation[] = [];
  for (const r of records) {
    if (r.kind === "entity") entities.set(r.id, r);
    else relations.push(r);
  }

  // Find matching entities
  const matching = [...entities.values()]
    .filter((e) => e.name.toLowerCase().includes(kw) && (!opts.type || e.type === opts.type))
    .slice(0, maxResults);

  return matching.map((entity) => {
    const connected = relations
      .filter((r) => r.from === entity.id || r.to === entity.id)
      .map((r) => {
        const targetId = r.from === entity.id ? r.to : r.from;
        const target = entities.get(targetId);
        return target ? { rel: r.rel, target, strength: r.strength, ts: r.ts } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .slice(0, 10);
    return { entity, relations: connected };
  });
}
