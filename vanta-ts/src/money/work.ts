import { appendMoney, readMoney, type MoneyRecord, type Deliverable, type Followup } from "./store.js";

// Deliverable + follow-up helpers for the Money OS.
// Append/query helpers mirror the existing offer/prospect pattern (latest-write-wins).
// Pure logic fns (`dueFollowups`, `deliverableProgress`) accept injected data — no I/O.

// ── type guards ───────────────────────────────────────────────────────────────

const isDeliverable = (r: MoneyRecord): r is Deliverable => r.kind === "deliverable";
const isFollowup = (r: MoneyRecord): r is Followup => r.kind === "followup";

// ── append helpers ────────────────────────────────────────────────────────────

export async function appendDeliverable(rec: Deliverable, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await appendMoney(rec, env);
}

export async function appendFollowup(rec: Followup, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await appendMoney(rec, env);
}

// ── query helpers (latest-write-wins by id) ───────────────────────────────────

/** Latest deliverable per id. Pure. */
export function latestDeliverables(recs: MoneyRecord[]): Deliverable[] {
  const byId = new Map<string, Deliverable>();
  for (const d of recs.filter(isDeliverable)) byId.set(d.id, d);
  return [...byId.values()];
}

/** Latest follow-up per id. Pure. */
export function latestFollowups(recs: MoneyRecord[]): Followup[] {
  const byId = new Map<string, Followup>();
  for (const f of recs.filter(isFollowup)) byId.set(f.id, f);
  return [...byId.values()];
}

// ── pure logic ────────────────────────────────────────────────────────────────

/**
 * Follow-ups that are not done and whose due date is ≤ now, soonest first.
 * `now` is epoch ms — pass Date.now() at the call boundary; never reads the clock.
 */
export function dueFollowups(followups: Followup[], now: number): Followup[] {
  return followups
    .filter((f) => !f.done && new Date(f.due).getTime() <= now)
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
}

/** Count of done vs total deliverables. Pure. */
export function deliverableProgress(deliverables: Deliverable[]): { done: number; total: number } {
  return {
    done: deliverables.filter((d) => d.status === "done").length,
    total: deliverables.length,
  };
}

// ── I/O convenience (used by the tool) ───────────────────────────────────────

export async function readDeliverables(env: NodeJS.ProcessEnv = process.env): Promise<Deliverable[]> {
  return latestDeliverables(await readMoney(env));
}

export async function readFollowups(env: NodeJS.ProcessEnv = process.env): Promise<Followup[]> {
  return latestFollowups(await readMoney(env));
}
