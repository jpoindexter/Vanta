import { z } from "zod";

export const AsyncResultSchema = z.object({
  id: z.string().min(1), goal: z.string(), output: z.string(), finishedAt: z.string(),
  ok: z.boolean().optional(),
  effectDisposition: z.enum(["none", "denied", "expired", "unknown", "confirmed", "compensated"]).optional(),
  verification: z.object({ status: z.enum(["unverified", "verified"]) }).optional(),
}).strict();
export type AsyncResult = z.infer<typeof AsyncResultSchema>;
const ClaimSchema = z.object({ event: z.literal("claim"), id: z.string().min(1), resultIds: z.array(z.string().min(1)).min(1) }).strict();
const DeliveredSchema = z.object({ event: z.literal("delivered"), id: z.string().min(1) }).strict();
const StartedSchema = z.object({ event: z.literal("started"), id: z.string().min(1) }).strict();
const ReviewSchema = z.object({ event: z.literal("review") }).strict();
const RecordSchema = z.union([AsyncResultSchema, ClaimSchema, DeliveredSchema, StartedSchema, ReviewSchema]);
export type AsyncRecord = z.infer<typeof RecordSchema>;
export type AsyncQueueState = { pending: AsyncResult[]; claims: Map<string, string[]>; review: boolean };

export function isAsyncSuccess(result: AsyncResult): boolean {
  return result.ok === true && (result.effectDisposition === undefined || result.effectDisposition === "confirmed");
}

function parseRecords(raw: string): { records: AsyncRecord[]; invalid: boolean } {
  const records: AsyncRecord[] = [];
  let invalid = false;
  for (const line of raw.split("\n").filter(line => line.trim())) {
    try {
      const record = RecordSchema.safeParse(JSON.parse(line));
      if (record.success) records.push(record.data);
      else invalid = true;
    } catch { invalid = true; }
  }
  return { records, invalid };
}

function acceptResult(results: Map<string, AsyncResult>, row: AsyncResult): boolean {
  const prior = results.get(row.id);
  if (!prior) results.set(row.id, row);
  return !isAsyncSuccess(row) || (prior !== undefined && JSON.stringify(prior) !== JSON.stringify(row));
}

function acceptClaim(state: AsyncQueueState, row: z.infer<typeof ClaimSchema>, claimed: Set<string>): boolean {
  const available = new Set(state.pending.map(result => result.id));
  if (state.claims.has(row.id) || new Set(row.resultIds).size !== row.resultIds.length) return false;
  if (row.resultIds.some(id => !available.has(id) || claimed.has(id))) return false;
  row.resultIds.forEach(id => claimed.add(id));
  state.claims.set(row.id, row.resultIds);
  return true;
}

function acceptStarted(started: Set<string>, results: Map<string, AsyncResult>, id: string): boolean {
  const conflict = started.has(id) || results.has(id);
  started.add(id);
  return conflict;
}

function applyControl(state: AsyncQueueState, row: Exclude<AsyncRecord, AsyncResult>, cursor: {
  started: Set<string>; results: Map<string, AsyncResult>; claimed: Set<string>;
}): void {
  if (row.event === "review") state.review = true;
  else if (row.event === "started") state.review = acceptStarted(cursor.started, cursor.results, row.id) || state.review;
  else if (row.event === "claim") {
    if (!acceptClaim(state, row, cursor.claimed)) state.review = true;
  } else if (!state.claims.delete(row.id)) state.review = true;
}

/** Missing/contradictory legacy truth and unresolved deliveries fail closed. */
export function readAsyncQueue(raw: string): AsyncQueueState {
  const { records, invalid } = parseRecords(raw);
  const results = new Map<string, AsyncResult>();
  const claimed = new Set<string>();
  const started = new Set<string>();
  const state: AsyncQueueState = { pending: [], claims: new Map(), review: invalid };
  for (const row of records) {
    if (!("event" in row)) {
      state.review = acceptResult(results, row) || state.review;
      state.pending = [...results.values()];
      started.delete(row.id);
    } else applyControl(state, row, { started, results, claimed });
  }
  state.pending = [...results.values()].filter(result => !claimed.has(result.id));
  state.review ||= state.claims.size > 0 || started.size > 0;
  return state;
}
