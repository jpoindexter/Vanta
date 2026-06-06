import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { resolveVantaHome } from "../store/home.js";

// BRAIN-5D: Replaces flat .md brain regions with a typed, timestamped,
// strength-scored, cross-referenced, decay-aware entry model. 5 dimensions per entry:
// (1) type/region, (2) temporal, (3) strength 0-1, (4) relatedIds, (5) forgetAfter decay.
// Enabled when VANTA_BRAIN_V2=1; flat .md regions remain the default.

export type BrainEntryType =
  | "fact" | "skill" | "preference" | "pattern" | "insight" | "plan" | "emotion";

export type BrainEntry5D = {
  id: string;
  region: string;            // (1) type/region
  entryType: BrainEntryType;
  content: string;
  createdAt: string;         // (2) temporal
  updatedAt: string;
  strength: number;          // (3) 0–1 consolidation score
  confidence: number;        // epistemic certainty
  relatedIds: string[];      // (4) cross-references
  forgetAfter?: string;      // (5) ISO date — entry decays after this
};

type Brain5DStore = { entries: BrainEntry5D[] };

function brain5dFile(env?: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "brain5d.json");
}

function entryId(region: string, content: string): string {
  return createHash("sha256").update(`${region}:${content.slice(0, 100)}`).digest("hex").slice(0, 12);
}

async function loadStore(env?: NodeJS.ProcessEnv): Promise<Brain5DStore> {
  try {
    return JSON.parse(await readFile(brain5dFile(env), "utf8")) as Brain5DStore;
  } catch {
    return { entries: [] };
  }
}

async function saveStore(store: Brain5DStore, env?: NodeJS.ProcessEnv): Promise<void> {
  await mkdir(resolveVantaHome(env), { recursive: true });
  await writeFile(brain5dFile(env), JSON.stringify(store, null, 2), "utf8");
}

/** Upsert a brain entry. Returns the entry. */
export async function upsertEntry(
  partial: Omit<BrainEntry5D, "id" | "createdAt" | "updatedAt">,
  env?: NodeJS.ProcessEnv,
): Promise<BrainEntry5D> {
  const store = await loadStore(env);
  const id = entryId(partial.region, partial.content);
  const now = new Date().toISOString();
  const existing = store.entries.findIndex((e) => e.id === id);
  const entry: BrainEntry5D = existing >= 0
    ? { ...store.entries[existing]!, ...partial, id, updatedAt: now, strength: Math.min(1, (store.entries[existing]!.strength + 0.1)) }
    : { ...partial, id, createdAt: now, updatedAt: now };
  if (existing >= 0) store.entries[existing] = entry;
  else store.entries.push(entry);
  await saveStore(store, env);
  return entry;
}

/** Score function: strength * recency decay (entries older than 30d lose strength). */
export function entryScore(entry: BrainEntry5D, now = new Date()): number {
  const ageMs = now.getTime() - new Date(entry.updatedAt).getTime();
  const ageDays = ageMs / 86_400_000;
  const recency = Math.exp(-ageDays / 30); // 30-day half-life
  return entry.strength * recency;
}

/** Check if an entry has decayed past its forgetAfter date. */
export function isDecayed(entry: BrainEntry5D, now = new Date()): boolean {
  if (!entry.forgetAfter) return false;
  return new Date(entry.forgetAfter) < now;
}

/** Return top-K entries by strength*recency, skipping decayed ones. */
export async function topEntries(
  topK = 20,
  opts: { region?: string; env?: NodeJS.ProcessEnv; now?: Date } = {},
): Promise<BrainEntry5D[]> {
  const store = await loadStore(opts.env);
  const now = opts.now ?? new Date();
  return store.entries
    .filter((e) => !isDecayed(e, now) && (!opts.region || e.region === opts.region))
    .sort((a, b) => entryScore(b, now) - entryScore(a, now))
    .slice(0, topK);
}

/** Format top entries for prompt injection. */
export async function brain5dDigest(env?: NodeJS.ProcessEnv, topK = 15): Promise<string> {
  const entries = await topEntries(topK, { env });
  if (!entries.length) return "";
  const lines = entries.map(
    (e) => `[${e.region}|str:${e.strength.toFixed(2)}] ${e.content.slice(0, 200)}`,
  );
  return `### Brain 5D (top ${entries.length} by strength×recency)\n${lines.join("\n")}`;
}
