import { randomUUID } from "node:crypto";
import type { Prospect } from "../money/store.js";
import type { Opportunity } from "./store.js";
import { score } from "./store.js";

// Slice 3: promote a scored radar opportunity into a Money-OS prospect.
// Pure module — no I/O. Deterministic: same opportunity always maps to the
// same prospect shape (modulo a fresh id + ts).

/** The subset of Prospect fields callers supply when creating via radar. */
export type ProspectInput = Omit<Prospect, "kind">;

/**
 * Map a radar Opportunity to a Money-OS ProspectInput.
 *
 * Mapping rules:
 *   name   ← opportunity title
 *   source ← opportunity source (carried into the note when present)
 *   note   ← "pain:<X> score:<Y> — <original note or title>"
 *   stage  ← "lead" (earliest Money-OS pipeline stage)
 *   id     ← new UUID (prospects are independent records from their origin)
 *   ts     ← now
 */
export function toProspect(opp: Opportunity): ProspectInput {
  const composite = score(opp).toFixed(2);
  const painLabel = opp.pain !== undefined ? String(opp.pain.toFixed(2)) : "?";
  const noteParts: string[] = [`pain:${painLabel}`, `score:${composite}`];
  if (opp.source) noteParts.push(`source:${opp.source}`);
  const detail = opp.note ?? opp.title;
  const note = `${noteParts.join(" ")} — ${detail}`;

  return {
    id: randomUUID(),
    name: opp.title,
    stage: "lead",
    note,
    ts: new Date().toISOString(),
  };
}
