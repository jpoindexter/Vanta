import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveVantaHome, commitInHome } from "../store/home.js";
import { brainDir } from "./store.js";
import {
  RawEntrySchema, normalizeEntry, entryId, entriesFile,
  type BrainEntry, type CrystalStatus, type UpsertOpts,
} from "./entry-types.js";
export * from "./entry-types.js";

function parseRawEntries(list: unknown[]): BrainEntry[] {
  return list.flatMap((e) => {
    const r = RawEntrySchema.safeParse(e);
    return r.success ? [normalizeEntry(r.data)] : [];
  });
}

async function migrateLegacy(env: NodeJS.ProcessEnv): Promise<BrainEntry[] | null> {
  try {
    const raw: unknown = JSON.parse(await readFile(join(resolveVantaHome(env), "brain5d.json"), "utf8"));
    const list = (raw as { entries?: unknown[] }).entries;
    if (!Array.isArray(list)) return null;
    const entries = parseRawEntries(list);
    return entries.length ? entries : null;
  } catch {
    return null;
  }
}

export async function loadEntries(env: NodeJS.ProcessEnv = process.env): Promise<BrainEntry[]> {
  let text: string;
  try {
    text = await readFile(entriesFile(env), "utf8");
  } catch {
    const migrated = await migrateLegacy(env);
    if (migrated) await saveEntries(migrated, env).catch(() => {});
    return migrated ?? [];
  }
  try {
    const raw: unknown = JSON.parse(text);
    if (!Array.isArray(raw)) throw new Error("not an array");
    return parseRawEntries(raw);
  } catch {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    await copyFile(entriesFile(env), join(brainDir(env), `entries.corrupt-${ts}.json`)).catch(() => {});
    return [];
  }
}

export async function saveEntries(entries: BrainEntry[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await mkdir(brainDir(env), { recursive: true });
  await writeFile(entriesFile(env), JSON.stringify(entries, null, 2), "utf8");
  await commitInHome(join("brain", "entries.json"), "brain: entries", env);
}

export function adjustedConfidence(e: BrainEntry): number {
  return Math.max(0, e.confidence - Math.min(0.5, e.contradicts.length * 0.15));
}

export function entryScore(e: BrainEntry, now = new Date()): number {
  const lastTouch = e.accessedAt && e.accessedAt > e.updatedAt ? e.accessedAt : e.updatedAt;
  const ageDays = (now.getTime() - new Date(lastTouch).getTime()) / 86_400_000;
  const recency = Math.exp(-ageDays / 14);
  const retrieval = Math.log1p(e.retrievalCount) / 10;
  return e.strength * recency * adjustedConfidence(e) * (1 + e.salience * 0.5 + retrieval);
}

export function isDecayed(e: BrainEntry, now = new Date()): boolean {
  return !!e.forgetAfter && new Date(e.forgetAfter) < now;
}

export function crystalFor(retrievalCount: number): CrystalStatus {
  if (retrievalCount >= 10) return "crystallized";
  if (retrievalCount >= 3) return "compressed";
  return "raw";
}

export async function upsertEntry(opts: UpsertOpts): Promise<BrainEntry> {
  const { env, now = new Date(), ...rest } = opts;
  const region = rest.region.trim();
  const content = rest.content.trim();
  if (!region || !content) throw new Error("brain entry needs a non-empty region and content");
  const axes = { ...rest, region, content };
  const entries = await loadEntries(env);
  const id = entryId(region, content);
  const idx = entries.findIndex((e) => e.id === id);
  if (idx >= 0) {
    const prev = entries[idx]!;
    entries[idx] = {
      ...prev,
      ...axes,
      strength: Math.min(1, Math.max(prev.strength + 0.1, axes.strength ?? 0)),
      updatedAt: now.toISOString(),
    };
  } else {
    entries.push(normalizeEntry(axes, now));
  }
  await saveEntries(entries, env);
  return entries[idx >= 0 ? idx : entries.length - 1]!;
}

export async function reinforceEntries(ids: string[], env?: NodeJS.ProcessEnv, now = new Date()): Promise<number> {
  if (!ids.length) return 0;
  const wanted = new Set(ids);
  const entries = await loadEntries(env);
  let hit = 0;
  for (const e of entries) {
    if (!wanted.has(e.id)) continue;
    hit++;
    e.retrievalCount += 1;
    e.accessedAt = now.toISOString();
    e.strength = Math.min(1, e.strength + 0.05);
    e.crystalStatus = crystalFor(e.retrievalCount);
  }
  if (hit) await saveEntries(entries, env);
  return hit;
}

export async function sweepDecayed(env?: NodeJS.ProcessEnv, now = new Date()): Promise<number> {
  const entries = await loadEntries(env);
  const kept = entries.filter((e) => !isDecayed(e, now));
  const removed = entries.length - kept.length;
  if (removed) await saveEntries(kept, env);
  return removed;
}

export type TopOpts = { topK?: number; region?: string; query?: string; env?: NodeJS.ProcessEnv; now?: Date };

export async function topEntries(opts: TopOpts = {}): Promise<BrainEntry[]> {
  const { topK = 20, region, query, env, now = new Date() } = opts;
  const q = query?.toLowerCase();
  return (await loadEntries(env))
    .filter((e) => !isDecayed(e, now))
    .filter((e) => !region || e.region === region)
    .filter((e) => !q || e.content.toLowerCase().includes(q))
    .sort((a, b) => entryScore(b, now) - entryScore(a, now))
    .slice(0, topK);
}

export function formatEntry(e: BrainEntry): string {
  const tags = [
    `str:${e.strength.toFixed(2)}`,
    `conf:${adjustedConfidence(e).toFixed(2)}`,
    e.crystalStatus !== "raw" ? e.crystalStatus : null,
    e.contradicts.length ? "⚡conflict" : null,
  ].filter(Boolean).join(" ");
  return `[${e.region}|${tags}] ${e.content.slice(0, 150)}`;
}
