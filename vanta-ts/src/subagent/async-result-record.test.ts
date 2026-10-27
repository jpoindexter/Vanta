import { describe, expect, it } from "vitest";
import { readAsyncQueue } from "./async-result-record.js";

const result = { id: "worker", goal: "private", output: "summary", finishedAt: "now", ok: true };
const claim = { event: "claim", id: "delivery", resultIds: ["worker"] };
const delivered = { event: "delivered", id: "delivery" };
const state = (...records: unknown[]) => readAsyncQueue(records.map(record => JSON.stringify(record)).join("\n"));

describe("durable background result truth", () => {
  it("holds legacy rows instead of guessing success from prose", () => {
    const { ok: _ok, ...legacy } = result;
    expect(state(legacy)).toMatchObject({ review: true, pending: [legacy] });
  });

  it.each(["unknown", "denied", "none", "expired", "compensated"])("holds contradictory success with %s disposition", effectDisposition => {
    expect(state({ ...result, effectDisposition }).review).toBe(true);
  });

  it("preserves uncertainty in either duplicate order, even after delivery", () => {
    const uncertain = { ...result, ok: false, effectDisposition: "unknown" };
    expect(state(result, uncertain).review).toBe(true);
    expect(state(uncertain, result).review).toBe(true);
    expect(state(result, claim, delivered, uncertain).review).toBe(true);
  });

  it("deduplicates identical success without making it replayable", () => {
    expect(state(result, result).pending).toEqual([result]);
    expect(state(result, claim, delivered, result)).toMatchObject({ review: false, pending: [] });
  });

  it("holds an unresolved delivery until its exact acknowledgment", () => {
    expect(state(result, claim)).toMatchObject({ review: true, pending: [] });
    expect(state(result, claim, delivered)).toMatchObject({ review: false, pending: [] });
    expect(state(result, { ...delivered, id: "other" }).review).toBe(true);
  });

  it("retains pre-launch custody if a terminal result is lost", () => {
    const started = { event: "started", id: "worker" };
    expect(state(started)).toMatchObject({ review: true, pending: [] });
    expect(state(started, result)).toMatchObject({ review: false, pending: [result] });
    expect(state(started, { ...result, ok: false }).review).toBe(true);
    expect(state(result, started).review).toBe(true);
  });

  it("does not let malformed or repeated control records authorize delivery", () => {
    expect(readAsyncQueue(JSON.stringify(result) + "\n{bad").review).toBe(true);
    expect(state(result, claim, claim).review).toBe(true);
    expect(state(result, { ...claim, resultIds: ["worker", "worker"] }).review).toBe(true);
    expect(state(result, { ...claim, resultIds: ["missing"] }).review).toBe(true);
  });
});
