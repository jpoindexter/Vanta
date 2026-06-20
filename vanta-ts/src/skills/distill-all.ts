import { createHash } from "node:crypto";

// SKILL-DISTILL-CLI. `distillSkill` (distill.ts) can compress ONE skill into worked
// examples, but nothing generated DISTILLED.md across the installed library — so the
// distilled-context measurement + opt-in runtime serving had no data. This orchestrates
// a bulk pass: list installed skills, distil each via an INJECTED distiller, write a
// DISTILLED.md stamped with the source body's content hash, and SKIP any skill whose
// stored hash already matches (idempotent). All side effects are injected so the pass is
// unit-testable without a provider or the network.

/** Marker line carrying the source-body hash so a re-run can skip up-to-date skills. */
const HASH_PREFIX = "<!-- vanta-distill:";
const HASH_SUFFIX = " -->";

/** A skill to distil: its name (for the model) and full body (the hash source). */
export type DistillTarget = { name: string; body: string };

/** Outcome for one skill in the bulk pass. */
export type DistillStatus = "distilled" | "skipped" | "failed";
export type DistillOutcome = { name: string; status: DistillStatus };

/** Injected side effects — keeps the orchestration pure and provider/network-free in tests. */
export type DistillAllDeps = {
  /** Installed skills to consider (the caller decides --all vs one). */
  list: () => Promise<DistillTarget[]>;
  /** Compress one skill body into distilled markdown, or null on empty/failed distill. */
  distill: (target: DistillTarget) => Promise<string | null>;
  /** Existing DISTILLED.md content for a skill, or null when absent. */
  readExisting: (name: string) => Promise<string | null>;
  /** Persist DISTILLED.md content for a skill (caller resolves the path). */
  writeOut: (name: string, content: string) => Promise<void>;
};

/** Stable content hash of a skill body. Pure. */
export function bodyHash(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex").slice(0, 16);
}

/** Read the source-body hash a DISTILLED.md was stamped with, or null if unstamped. Pure. */
export function readStampedHash(distilled: string): string | null {
  const line = distilled.split("\n", 1)[0] ?? "";
  if (!line.startsWith(HASH_PREFIX) || !line.endsWith(HASH_SUFFIX)) return null;
  return line.slice(HASH_PREFIX.length, line.length - HASH_SUFFIX.length).trim() || null;
}

/** Prepend the source-body hash stamp to distilled markdown. Pure. */
export function stampDistilled(body: string, distilled: string): string {
  return `${HASH_PREFIX}${bodyHash(body)}${HASH_SUFFIX}\n${distilled}`;
}

/** True when an existing DISTILLED.md is already current for this body. Pure. */
export function isUpToDate(body: string, existing: string | null): boolean {
  return existing !== null && readStampedHash(existing) === bodyHash(body);
}

/** Distil one target unless already current; returns its outcome. */
async function distillOne(target: DistillTarget, deps: DistillAllDeps): Promise<DistillOutcome> {
  const existing = await deps.readExisting(target.name);
  if (isUpToDate(target.body, existing)) return { name: target.name, status: "skipped" };
  const distilled = await deps.distill(target);
  if (!distilled) return { name: target.name, status: "failed" };
  await deps.writeOut(target.name, stampDistilled(target.body, distilled));
  return { name: target.name, status: "distilled" };
}

/**
 * Generate DISTILLED.md across the given installed skills. Idempotent: a skill whose
 * stored hash matches its current body is skipped. Sequential (the distiller calls a
 * provider — no parallel API fan-out). Best-effort per skill: one failure never aborts
 * the batch.
 */
export async function distillAll(deps: DistillAllDeps): Promise<DistillOutcome[]> {
  const targets = await deps.list();
  const outcomes: DistillOutcome[] = [];
  for (const target of targets) {
    try {
      outcomes.push(await distillOne(target, deps));
    } catch {
      outcomes.push({ name: target.name, status: "failed" });
    }
  }
  return outcomes;
}

/** One-line human summary of a bulk pass. Pure. */
export function formatDistillReport(outcomes: DistillOutcome[]): string {
  const count = (s: DistillStatus): number => outcomes.filter((o) => o.status === s).length;
  return `Distilled ${count("distilled")}, skipped ${count("skipped")} up-to-date, ${count("failed")} failed (of ${outcomes.length}).`;
}
