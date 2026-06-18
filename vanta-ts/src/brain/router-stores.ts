import { resolveBrain } from "./interface.js";
import { isLivePointer } from "./ingest-gate.js";
import { readWorld, latestEntities, relations } from "../world/store.js";
import { recallWithSources } from "../world/conflicts.js";
import { gatherLifeBlobs, searchBlobs } from "../search/life.js";
import { rankResults } from "../search/life-rank.js";
import type { StoreId, StoreLookup } from "./router.js";

// Real store adapters for the brain router. Each is best-effort: a missing/empty/broken
// store returns null so the router falls through to the next. The entries + live steps
// go through the Brain PORT (resolveBrain), so a swapped brain routes unchanged.

function entriesLookup(env: NodeJS.ProcessEnv): StoreLookup {
  return async (q) => {
    const r = await resolveBrain(env).recall({ query: q, topK: 5, reinforce: false, env });
    return r.entries.length ? r.formatted : null;
  };
}

// The live step surfaces ingest-gate live pointers (volatile facts kept as fetch-live
// references, never copies) — recall's route to current data.
function liveLookup(env: NodeJS.ProcessEnv): StoreLookup {
  return async (q) => {
    const r = await resolveBrain(env).recall({ query: q, topK: 10, reinforce: false, env });
    const ptrs = r.entries.filter((e) => isLivePointer(e.content));
    return ptrs.length ? ptrs.map((e) => e.content).join("\n") : null;
  };
}

function worldLookup(env: NodeJS.ProcessEnv): StoreLookup {
  return async (q) => {
    const recs = await readWorld(env);
    const matches = recallWithSources(latestEntities(recs), relations(recs), q);
    return matches.length ? matches.map((m) => m.text).join("\n") : null;
  };
}

function lifeSearchLookup(env: NodeJS.ProcessEnv, root: string): StoreLookup {
  return async (q) => {
    const blobs = await gatherLifeBlobs(env, root);
    const hits = searchBlobs(blobs, q);
    if (!hits.length) return null;
    return rankResults(hits, q, Date.now()).map((h) => `${h.source}: ${h.snippet}`).join("\n");
  };
}

/** Wire the real stores into router lookups. Stores without an adapter (regions, vault)
 * are simply absent and skipped by the router until they are wired. */
export function defaultLookups(
  env: NodeJS.ProcessEnv,
  root: string,
): Partial<Record<StoreId, StoreLookup>> {
  return {
    entries: entriesLookup(env),
    world: worldLookup(env),
    "life-search": lifeSearchLookup(env, root),
    live: liveLookup(env),
  };
}
