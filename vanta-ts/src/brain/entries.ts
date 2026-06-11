import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { resolveVantaHome, commitInHome } from "../store/home.js";
import { brainDir } from "./store.js";

// The brain's structured-entry layer: typed, timestamped, strength-scored,
// decay-aware memories with the cognitive axes (confidence, salience, valence,
// retrieval reinforcement, contradiction penalty, crystallization). Stored as
// JSON at ~/.vanta/brain/entries.json, git-versioned like the regions. The
// reader is tolerant by design — a malformed entry is dropped, a corrupt file
// is quarantined (never deleted) — so the brain heals instead of breaking.

export type EntryType = "fact" | "skill" | "preference" | "pattern" | "insight" | "plan" | "emotion";
export type SourceType = "observation" | "inference" | "self-report" | "external" | "crystallized";
export type CrystalStatus = "raw" | "compressed" | "crystallized";

const RawEntrySchema = z
  .object({
    id: z.string().optional(),
    region: z.string().min(1),
    content: z.string().min(1),
    entryType: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    accessedAt: z.string().optional(),
    strength: z.number().optional(),
    confidence: z.number().optional(),
    salience: z.number().optional(),
    valence: z.number().optional(),
    retrievalCount: z.number().optional(),
    sourceType: z.string().optional(),
    sourceRef: z.string().optional(),
    contradicts: z.array(z.string()).optional(),
    relatedIds: z.array(z.string()).optional(),
    crystalStatus: z.string().optional(),
    forgetAfter: z.string().optional(),
  })
  .passthrough();

export type BrainEntry = {
  id: string;
  region: string;
  content: string;
  entryType: EntryType;
  createdAt: string;
  updatedAt: string;
  accessedAt?: string;
  strength: number; // 0–1 consolidation
  confidence: number; // 0–1 epistemic certainty
  salience: number; // 0–1 attention weight
  valence: number; // −1..+1 emotional tone
  retrievalCount: number; // reinforced by use
  sourceType: SourceType;
  sourceRef?: string;
  contradicts: string[]; // ids of conflicting entries
  relatedIds: string[];
  crystalStatus: CrystalStatus;
  forgetAfter?: string; // ISO date — decays after this
};

const ENTRY_TYPES = new Set<string>(["fact", "skill", "preference", "pattern", "insight", "plan", "emotion"]);
const SOURCE_TYPES = new Set<string>(["observation", "inference", "self-report", "external", "crystallized"]);
const CRYSTAL_STATUSES = new Set<string>(["raw", "compressed", "crystallized"]);
const clamp01 = (n: number | undefined, fallback: number): number =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
const pickEnum = <T extends string>(value: string | undefined, allowed: Set<string>, fallback: T): T =>
  (allowed.has(value ?? "") ? value : fallback) as T;
const valenceOf = (n: number | undefined): number =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(-1, n)) : 0;
const countOf = (n: number | undefined): number =>
  typeof n === "number" && n >= 0 ? Math.floor(n) : 0;

export function entryId(region: string, content: string): string {
  return createHash("sha256").update(`${region}:${content.slice(0, 100)}`).digest("hex").slice(0, 12);
}

/** Fill defaults so any legacy/partial entry becomes a full BrainEntry. */
export function normalizeEntry(raw: z.infer<typeof RawEntrySchema>, now = new Date()): BrainEntry {
  const ts = now.toISOString();
  return {
    id: raw.id ?? entryId(raw.region, raw.content),
    region: raw.region,
    content: raw.content,
    entryType: pickEnum<EntryType>(raw.entryType, ENTRY_TYPES, "fact"),
    createdAt: raw.createdAt ?? ts,
    updatedAt: raw.updatedAt ?? ts,
    accessedAt: raw.accessedAt,
    strength: clamp01(raw.strength, 0.5),
    confidence: clamp01(raw.confidence, 0.7),
    salience: clamp01(raw.salience, 0.5),
    valence: valenceOf(raw.valence),
    retrievalCount: countOf(raw.retrievalCount),
    sourceType: pickEnum<SourceType>(raw.sourceType, SOURCE_TYPES, "observation"),
    sourceRef: raw.sourceRef,
    contradicts: raw.contradicts ?? [],
    relatedIds: raw.relatedIds ?? [],
    crystalStatus: pickEnum<CrystalStatus>(raw.crystalStatus, CRYSTAL_STATUSES, "raw"),
    forgetAfter: raw.forgetAfter,
  };
}

export function entriesFile(env: NodeJS.ProcessEnv = process.env): string {
  return join(brainDir(env), "entries.json");
}

/** One-time migration from the legacy ~/.vanta/brain5d.json store (left in place). */
async function migrateLegacy(env: NodeJS.ProcessEnv): Promise<BrainEntry[] | null> {
  try {
    const raw: unknown = JSON.parse(await readFile(join(resolveVantaHome(env), "brain5d.json"), "utf8"));
    const list = (raw as { entries?: unknown[] }).entries;
    if (!Array.isArray(list)) return null;
    const entries = list
      .map((e) => RawEntrySchema.safeParse(e))
      .filter((r) => r.success)
      .map((r) => normalizeEntry(r.data!));
    return entries.length ? entries : null;
  } catch {
    return null;
  }
}

/**
 * Load all entries. Tolerant: malformed entries are dropped; a corrupt file is
 * quarantined to entries.corrupt-<ts>.json (copied, never deleted) and treated
 * as empty; a missing file triggers the one-time legacy migration.
 */
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
    return raw
      .map((e) => RawEntrySchema.safeParse(e))
      .filter((r) => r.success)
      .map((r) => normalizeEntry(r.data!));
  } catch {
    // Quarantine the unreadable store so nothing is lost, then start clean.
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

/** Confidence after the contradiction penalty (−0.15 per conflict, capped at −0.5). */
export function adjustedConfidence(e: BrainEntry): number {
  return Math.max(0, e.confidence - Math.min(0.5, e.contradicts.length * 0.15));
}

/** Strength × recency (14-day half-life) × adjusted confidence, with salience + retrieval bonuses. */
export function entryScore(e: BrainEntry, now = new Date()): number {
  const ageDays = (now.getTime() - new Date(e.updatedAt).getTime()) / 86_400_000;
  const recency = Math.exp(-ageDays / 14);
  const retrieval = Math.log1p(e.retrievalCount) / 10;
  return e.strength * recency * adjustedConfidence(e) * (1 + e.salience * 0.5 + retrieval);
}

export function isDecayed(e: BrainEntry, now = new Date()): boolean {
  return !!e.forgetAfter && new Date(e.forgetAfter) < now;
}

/** Retrieval crystallizes a memory: raw → compressed (3 uses) → crystallized (10). */
export function crystalFor(retrievalCount: number): CrystalStatus {
  if (retrievalCount >= 10) return "crystallized";
  if (retrievalCount >= 3) return "compressed";
  return "raw";
}

export type UpsertOpts = Partial<Omit<BrainEntry, "id" | "region" | "content" | "createdAt" | "updatedAt">> & {
  region: string;
  content: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
};

/** Insert a new entry, or re-asserting the same content strengthens it (+0.1). */
export async function upsertEntry(opts: UpsertOpts): Promise<BrainEntry> {
  const { env, now = new Date(), region, content, ...axes } = opts;
  const entries = await loadEntries(env);
  const id = entryId(region, content);
  const idx = entries.findIndex((e) => e.id === id);
  if (idx >= 0) {
    const prev = entries[idx]!;
    entries[idx] = {
      ...prev,
      ...axes,
      strength: Math.min(1, prev.strength + 0.1),
      updatedAt: now.toISOString(),
    };
  } else {
    entries.push(normalizeEntry({ region, content, ...axes }, now));
  }
  await saveEntries(entries, env);
  return entries[idx >= 0 ? idx : entries.length - 1]!;
}

/** Mark entries as retrieved: count++, slight strengthening, crystallization. */
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

/** Remove decayed entries. Returns how many were swept. */
export async function sweepDecayed(env?: NodeJS.ProcessEnv, now = new Date()): Promise<number> {
  const entries = await loadEntries(env);
  const kept = entries.filter((e) => !isDecayed(e, now));
  const removed = entries.length - kept.length;
  if (removed) await saveEntries(kept, env);
  return removed;
}

export type TopOpts = { topK?: number; region?: string; query?: string; env?: NodeJS.ProcessEnv; now?: Date };

/** Top entries by score, skipping decayed; optional region + substring filters. */
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

/** Compact one-line form for prompt injection / recall output. */
export function formatEntry(e: BrainEntry): string {
  const tags = [
    `str:${e.strength.toFixed(2)}`,
    `conf:${adjustedConfidence(e).toFixed(2)}`,
    e.crystalStatus !== "raw" ? e.crystalStatus : null,
    e.contradicts.length ? "⚡conflict" : null,
  ].filter(Boolean).join(" ");
  return `[${e.region}|${tags}] ${e.content.slice(0, 150)}`;
}
