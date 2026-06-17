import { z } from "zod";
import type { Compartment } from "./compartments.js";
import { resolveMemoryStore } from "../store/memory-store.js";

// Slice 2 of the self-repair rock: broken-capability detector +
// last-known-good rollback marker per compartment.
//
// Pure fns first (detectBroken, lastKnownGood), then the append-only
// store (repair.jsonl) following the world/radar/etc. idiom.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One capability check, tagged to a compartment. */
export type CapCheck = {
  /** Human-readable capability name, e.g. "kernel" */
  name: string;
  /** Which body compartment owns this capability. */
  compartment: Compartment;
  /** Did the check pass? */
  ok: boolean;
  /** Optional detail for display (error message or "up"). */
  detail?: string;
};

/** Derived health verdict for one compartment. */
export type CompartmentHealth = {
  compartment: Compartment;
  verdict: "healthy" | "impaired" | "down";
  /** The checks that belong to this compartment. */
  checks: CapCheck[];
};

/** A last-known-good marker persisted in repair.jsonl. */
export type RepairMarker = {
  compartment: Compartment;
  /** Git SHA at the time the compartment was known healthy. */
  sha: string;
  /** ISO timestamp. */
  ts: string;
};

// ---------------------------------------------------------------------------
// Zod schema (store boundary)
// ---------------------------------------------------------------------------

const RepairMarkerSchema = z.object({
  compartment: z.enum(["brainstem", "skeleton", "reflexes", "limbs", "memory"]),
  sha: z.string().min(1),
  ts: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Pure: detectBroken
// ---------------------------------------------------------------------------

/**
 * Map a list of capability checks to a per-compartment health verdict.
 *
 * - healthy : all checks for the compartment are ok
 * - impaired: some (but not all) checks are failing
 * - down    : all checks for the compartment are failing
 *
 * Compartments with no checks are omitted from the result.
 * Pure, deterministic.
 */
export function detectBroken(checks: CapCheck[]): CompartmentHealth[] {
  const byCompartment = new Map<Compartment, CapCheck[]>();
  for (const c of checks) {
    const existing = byCompartment.get(c.compartment) ?? [];
    existing.push(c);
    byCompartment.set(c.compartment, existing);
  }
  const result: CompartmentHealth[] = [];
  for (const [compartment, cs] of byCompartment) {
    const ok = cs.filter((c) => c.ok).length;
    const total = cs.length;
    const verdict: CompartmentHealth["verdict"] =
      ok === total ? "healthy" : ok === 0 ? "down" : "impaired";
    result.push({ compartment, verdict, checks: cs });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Pure: lastKnownGood
// ---------------------------------------------------------------------------

/**
 * Given an array of recorded markers, return the most recent good sha per
 * compartment. Last-write-wins (latest `ts` per compartment). Pure.
 */
export function lastKnownGood(
  records: RepairMarker[],
): Partial<Record<Compartment, string>> {
  const best = new Map<Compartment, RepairMarker>();
  for (const r of records) {
    const existing = best.get(r.compartment);
    if (!existing || r.ts > existing.ts) best.set(r.compartment, r);
  }
  const out: Partial<Record<Compartment, string>> = {};
  for (const [c, r] of best) out[c] = r.sha;
  return out;
}

// ---------------------------------------------------------------------------
// Store: repair.jsonl
// ---------------------------------------------------------------------------

const REPAIR_FILE = "repair.jsonl";

/**
 * Append a last-known-good marker for a compartment. The caller supplies the
 * git SHA — this fn never shells out.
 */
export async function recordGood(
  opts: { compartment: Compartment; sha: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const marker: RepairMarker = {
    compartment: opts.compartment,
    sha: opts.sha,
    ts: new Date().toISOString(),
  };
  await resolveMemoryStore(env).append(REPAIR_FILE, JSON.stringify(marker) + "\n");
}

/** Read all repair markers from disk. Returns [] on missing file. */
export async function readMarkers(
  env: NodeJS.ProcessEnv = process.env,
): Promise<RepairMarker[]> {
  const raw = await resolveMemoryStore(env).read(REPAIR_FILE);
  if (raw === null) return [];
  try {
    const results: RepairMarker[] = [];
    for (const line of raw.split("\n").filter(Boolean)) {
      const parsed = RepairMarkerSchema.safeParse(JSON.parse(line));
      if (parsed.success) results.push(parsed.data);
    }
    return results;
  } catch {
    return [];
  }
}
