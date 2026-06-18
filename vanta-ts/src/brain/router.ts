// BRAIN-ROUTER — a second brain is defined by "can the agent find it again": it must
// know WHERE each kind of data lives and in WHAT ORDER to look. Vanta has the stores
// (structured entries, md regions, world model, life-search, vault, live sources) but
// recall hit one store. This is the query-conditioned router: pick the store order for
// the intent, consult in order, STOP at the first sufficient hit, return it with
// provenance + the fallback trail. Pure engine; real stores injected as lookups so it
// composes through the Brain port (entries) plus the world/life-search adapters.

export type StoreId = "entries" | "regions" | "world" | "life-search" | "vault" | "live";

/** A store lookup returns a sufficient answer (provenanced text) or null to fall through. */
export type StoreLookup = (query: string) => Promise<string | null>;

export type RoutedHit = { store: StoreId; text: string; trail: StoreId[] };

const DEFAULT_ORDER: StoreId[] = ["entries", "regions", "world", "life-search", "vault", "live"];

function prioritize(first: StoreId[]): StoreId[] {
  return [...first, ...DEFAULT_ORDER.filter((s) => !first.includes(s))];
}

/** Query-conditioned store order. Volatile/"current" → live source first; relationship
 * queries → world model first; everything else → the default order. Pure. */
export function routeOrder(query: string): StoreId[] {
  const q = query.toLowerCase();
  if (/\b(current|currently|latest|right now|today|unread|status|live|pending)\b/.test(q)) {
    return prioritize(["live", "life-search"]);
  }
  if (/\b(related|relationship|connected|connection|depends on|links? to|between|chain)\b/.test(q)) {
    return prioritize(["world"]);
  }
  return DEFAULT_ORDER;
}

/**
 * Graded fallback: consult stores in the routed order, returning the FIRST sufficient
 * hit with its provenance (store) and the trail of stores actually tried. Stores with
 * no provided lookup are skipped; a lookup that throws falls through (best-effort).
 * Returns null when no store answers. Pure given the injected lookups.
 */
export async function routeRecall(
  query: string,
  lookups: Partial<Record<StoreId, StoreLookup>>,
  order: StoreId[] = routeOrder(query),
): Promise<RoutedHit | null> {
  const trail: StoreId[] = [];
  for (const store of order) {
    const lookup = lookups[store];
    if (!lookup) continue;
    trail.push(store);
    let hit: string | null = null;
    try {
      hit = await lookup(query);
    } catch {
      hit = null;
    }
    if (hit && hit.trim()) return { store, text: hit, trail };
  }
  return null;
}

/** Render a routed hit with provenance for the model. Pure. */
export function formatRoutedHit(hit: RoutedHit): string {
  return `[source: ${hit.store} · tried: ${hit.trail.join(" → ")}]\n${hit.text}`;
}
