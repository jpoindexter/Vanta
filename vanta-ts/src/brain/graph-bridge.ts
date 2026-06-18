import type { WorldEntity, WorldRelation } from "../world/store.js";

// BRAIN-GRAPH-BRIDGE — Level 4 is tracing typed relationship chains (topic X → topic A).
// The transcript's warning: don't build a graph without pain, and Vanta already has one
// (the world model: entities + typed from/to/rel relations). So BRIDGE, don't build:
// let recall traverse the existing world relations to follow chains and surface related
// entities, returning the relation PATH as provenance. Bounded hop depth; a no-op when
// the world is empty. Pure (no I/O).

export type RelStep = { from: string; rel: string; to: string };
export type Chain = { target: string; path: RelStep[] };

export const DEFAULT_MAX_DEPTH = 3;

/** Entities whose type/name/note overlaps a query token (the traversal start set). Pure. */
function matchStarts(entities: WorldEntity[], query: string): WorldEntity[] {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  if (!tokens.length) return [];
  return entities.filter((e) => {
    const hay = `${e.type} ${e.name} ${e.note ?? ""}`.toLowerCase();
    return tokens.some((t) => hay.includes(t));
  });
}

/** BFS the directed relation graph from a start id, collecting every node reachable
 * within maxDepth hops with the typed path that reached it (cycles pruned). Pure. */
export function traverse(startId: string, rels: WorldRelation[], maxDepth: number): Chain[] {
  const chains: Chain[] = [];
  const visited = new Set<string>([startId]);
  let frontier: Chain[] = [{ target: startId, path: [] }];
  for (let depth = 0; depth < maxDepth; depth++) {
    const next: Chain[] = [];
    for (const c of frontier) {
      for (const r of rels) {
        if (r.from !== c.target || visited.has(r.to)) continue;
        visited.add(r.to);
        const chain: Chain = { target: r.to, path: [...c.path, { from: r.from, rel: r.rel, to: r.to }] };
        chains.push(chain);
        next.push(chain);
      }
    }
    if (!next.length) break;
    frontier = next;
  }
  return chains;
}

/** Render a relation chain as provenance: "A —rel→ B —rel→ C" (ids mapped to names). */
export function formatPath(path: RelStep[], nameOf: (id: string) => string): string {
  if (!path.length) return "";
  const head = nameOf(path[0]!.from);
  const rest = path.map((s) => ` —${s.rel}→ ${nameOf(s.to)}`).join("");
  return head + rest;
}

export type BridgeHit = { target: WorldEntity | { id: string }; path: RelStep[]; provenance: string };

/**
 * Bridge recall: from entities matching the query, traverse world relations and return
 * the reached entities (multi-hop chains) with their relation path as provenance. Empty
 * (no-op) when the world is empty or nothing matches. Bounded by maxDepth. Pure.
 */
export function bridgeRecall(
  query: string,
  entities: WorldEntity[],
  rels: WorldRelation[],
  maxDepth: number = DEFAULT_MAX_DEPTH,
): BridgeHit[] {
  if (!entities.length || !rels.length) return [];
  const byId = new Map(entities.map((e) => [e.id, e] as const));
  const nameOf = (id: string): string => byId.get(id)?.name ?? id;
  const out: BridgeHit[] = [];
  const seen = new Set<string>();
  for (const start of matchStarts(entities, query)) {
    for (const chain of traverse(start.id, rels, maxDepth)) {
      if (seen.has(chain.target)) continue;
      seen.add(chain.target);
      out.push({ target: byId.get(chain.target) ?? { id: chain.target }, path: chain.path, provenance: formatPath(chain.path, nameOf) });
    }
  }
  return out;
}
