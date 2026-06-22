// CCR-DISPOSITION measurement — does the agent re-expand a compressed/offloaded tool
// output (retrieve_original) often enough that CCR costs more than it saves? A LOW
// whole-retrieve rate means the compressed view usually sufficed → CCR nets positive.
// A HIGH rate is the double-context tax the agent-harness literature warns about
// (a FORCED full-retrieve makes CCR net-negative — the failure mode this avoids).
// Vanta's design makes retrieval OPTIONAL (an id in a footer), so this rate is the verdict.
// Pure: feed it the event log + the stash count; no I/O.

const RETRIEVE_PREFIX = "retrieve_original:";
const OFFLOAD_MARK = /original_id=|output truncated:/;

export type CcrVerdict = "keep" | "scope" | "retire";

export interface CcrUsage {
  /** retrieve_original invocations — the agent pulled a stashed original back whole. */
  retrieveCalls: number;
  /** result-offload (>50K tool output) deliveries — the rare grep-able-pointer path. */
  offloadDeliveries: number;
  /** total originals stashed under .vanta/ccr (all CCR producers: offload + code skeleton + JSON view). */
  stashCount: number;
  /** retrieveCalls / stashCount, clamped 0..1 — proxy for "fraction of stashed outputs pulled whole". */
  wholeRetrieveRate: number;
  verdict: CcrVerdict;
}

/** KEEP when the agent rarely re-expands (<1/3 of stashes); SCOPE to history-compaction
 * at moderate re-expansion; RETIRE from the live tool path only when most stashes get
 * pulled whole (the double-context tax dominates). Pure. */
export function ccrVerdict(wholeRetrieveRate: number): CcrVerdict {
  if (wholeRetrieveRate < 1 / 3) return "keep";
  if (wholeRetrieveRate < 2 / 3) return "scope";
  return "retire";
}

export function analyzeCcrUsage(events: ReadonlyArray<{ event?: string }>, stashCount: number): CcrUsage {
  let retrieveCalls = 0;
  let offloadDeliveries = 0;
  for (const e of events) {
    const s = e.event ?? "";
    if (s.startsWith(RETRIEVE_PREFIX)) retrieveCalls++;
    if (OFFLOAD_MARK.test(s)) offloadDeliveries++;
  }
  const wholeRetrieveRate = stashCount > 0 ? Math.min(1, retrieveCalls / stashCount) : 0;
  return { retrieveCalls, offloadDeliveries, stashCount, wholeRetrieveRate, verdict: ccrVerdict(wholeRetrieveRate) };
}

export function formatCcrUsage(u: CcrUsage): string {
  const pct = (u.wholeRetrieveRate * 100).toFixed(1);
  const action = u.verdict === "keep"
    ? "the compressed view sufficed most of the time; CCR nets positive."
    : u.verdict === "scope"
      ? "re-expansion is moderate; restrict CCR to history-compaction, not live tool output."
      : "the agent pulls most stashes back whole; CCR adds a net double-context tax.";
  return [
    `CCR offload usage:`,
    `  stashed originals:   ${u.stashCount}`,
    `  retrieve_original:   ${u.retrieveCalls}`,
    `  result-offloads:     ${u.offloadDeliveries}  (the >50K grep-able-pointer path)`,
    `  whole-retrieve rate: ${pct}%  (retrieves / stashes)`,
    `  verdict:             ${u.verdict.toUpperCase()} — ${action}`,
  ].join("\n");
}
