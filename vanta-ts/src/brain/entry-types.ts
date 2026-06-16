import { createHash } from "node:crypto";
import { z } from "zod";
import { brainDir } from "./store.js";
import { join } from "node:path";

export type EntryType = "fact" | "skill" | "preference" | "pattern" | "insight" | "plan" | "emotion";
export type SourceType = "observation" | "inference" | "self-report" | "external" | "crystallized";
export type CrystalStatus = "raw" | "compressed" | "crystallized";

export const RawEntrySchema = z
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
  strength: number;
  confidence: number;
  salience: number;
  valence: number;
  retrievalCount: number;
  sourceType: SourceType;
  sourceRef?: string;
  contradicts: string[];
  relatedIds: string[];
  crystalStatus: CrystalStatus;
  forgetAfter?: string;
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

export type UpsertOpts = Partial<Omit<BrainEntry, "id" | "region" | "content" | "createdAt" | "updatedAt">> & {
  region: string;
  content: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
};
