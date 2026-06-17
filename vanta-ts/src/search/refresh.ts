import { z } from "zod";
import { resolveMemoryStore } from "../store/memory-store.js";

// Change-detecting refresh for life-search. No embed dependency — cheap
// content hash (djb2) per store, persisted to ~/.vanta/life-index.json.
// When a store's digest differs from the saved value the store is "stale".

const INDEX_FILE = "life-index.json";

/** djb2 hash over a string, returned as a hex string. Pure, dependency-free. */
export function digestStore(content: string): string {
  let h = 5381;
  for (let i = 0; i < content.length; i++) {
    h = ((h << 5) + h + content.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export type StoreDigests = Record<string, string>;

export type ChangeReport = {
  changed: string[];
  unchanged: string[];
};

/**
 * Compare per-store digests. A store is "changed" when its digest differs from
 * the previous value OR when it is absent from prev (new store). Pure.
 */
export function detectChanges(prev: StoreDigests, next: StoreDigests): ChangeReport {
  const changed: string[] = [];
  const unchanged: string[] = [];
  for (const [store, digest] of Object.entries(next)) {
    if (prev[store] === digest) {
      unchanged.push(store);
    } else {
      changed.push(store);
    }
  }
  return { changed, unchanged };
}

// --- Persistence ---

const DigestsSchema = z.record(z.string(), z.string());

/** Load the last-saved digests. Returns {} when the file is missing or corrupt. */
export async function loadDigests(env: NodeJS.ProcessEnv = process.env): Promise<StoreDigests> {
  const store = resolveMemoryStore(env);
  const raw = await store.read(INDEX_FILE);
  if (raw === null) return {};
  try {
    const parsed = DigestsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/** Persist new digests atomically (write + mkdir best-effort). */
export async function saveDigests(
  digests: StoreDigests,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const store = resolveMemoryStore(env);
  await store.write(INDEX_FILE, JSON.stringify(digests, null, 2) + "\n");
}
