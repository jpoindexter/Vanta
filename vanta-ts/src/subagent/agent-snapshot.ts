// VANTA-AGENT-SNAPSHOT — propose a memory snapshot update for a custom agent.
//
// After a custom agent (a `.claude/agents/` def — see agent-defs.ts CustomAgentDef)
// finishes a session, Vanta can distil what THAT agent learned/did into a few
// durable one-line notes and propose appending them to the agent's OWN memory
// file, so a custom agent accrues memory across sessions. Mirrors the 0-3-notes
// style of brain/learn.ts (usually fewer, often none) — but the distillation is
// PURE here (the session-notes object is the input), not an LLM call.
//
// Everything in this file is pure + deterministic — no I/O, no LLM, no clock.
// The snapshot build (session → proposed additions), the diff against the prior
// memory, and the apply (prior + additions) are all pure + unit-tested. The
// actual WRITE to the agent's memory file is operator-confirmed and is NOT done
// here — that's the documented boundary (mirrors agent-defs.ts / fork-context.ts).
//
// WIRING (where the live custom-agent session teardown would call this, NOT done
// this round):
//   subagent/spawn.ts runWorker (custom-agent path): on SubagentStop for a
//     resolved CustomAgentDef, derive `sessionNotes` from the worker transcript
//     (its summary AgentOutcome + any key facts), read the agent's prior memory
//     file, then:
//       1. `buildAgentSnapshot(def.name, sessionNotes, priorMemory)` → snapshot
//       2. `hasSnapshot(snapshot)` false → STOP (nothing learned = no snapshot,
//          no spurious update, no dialog).
//       3. `snapshotDiff(snapshot, priorMemory)` → render the {added, unchanged}
//          diff as the operator confirm dialog (mirrors the clarity-gate /
//          per-tool approval surface — the operator sees the additions before
//          anything is written).
//       4. On operator-confirm ONLY: write `applySnapshot(priorMemory, snapshot)`
//          back to the agent's memory file (e.g. memory/store.ts appendMemory's
//          per-key store, keyed by the agent name — the disk write is the
//          boundary, never silent).
//   SECURITY: sessionNotes is custom-agent output — every proposed note is
//     control-stripped here before it can reach the confirm dialog or the file.

/** The most durable notes any one session may contribute. Mirrors learn.ts. */
const MAX_NOTES = 3;

/** Hard per-note length cap — a note is a one-line gist, never a transcript dump. */
const NOTE_CHAR_CAP = 200;

// Strip control chars (incl. ANSI ESC) — session notes are custom-agent output,
// so they could carry terminal-control codes; neutralize before any note is
// proposed, rendered in the confirm dialog, or written. Collapses whitespace
// (incl. newlines) so a note stays one line. Mirrors tools/ask-user.ts.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\x00-\x1f\x7f]/g;

/** Remove control characters, collapse whitespace, and trim. Pure. */
function controlStrip(text: string): string {
  return text.replace(CONTROL_RE, " ").replace(/\s+/g, " ").trim();
}

/** Clean a candidate note: control-strip, then cap to one gist line. Pure. */
function cleanNote(raw: string): string {
  const clean = controlStrip(raw);
  return clean.length > NOTE_CHAR_CAP ? `${clean.slice(0, NOTE_CHAR_CAP - 1)}…` : clean;
}

/**
 * Distilled durable notes a custom-agent session revealed. `summary` is the
 * session's headline takeaway; `keyFacts` are additional durable one-liners
 * (learned/did). Both are custom-agent output → control-stripped before use.
 */
export type SessionNotes = {
  /** The session's headline takeaway (what the agent learned/did). */
  readonly summary: string;
  /** Optional extra durable one-line notes from the session. */
  readonly keyFacts?: readonly string[];
};

/**
 * A proposed memory snapshot for one custom agent. `additions` are the NEW
 * durable notes (already control-stripped, deduped against the prior memory,
 * capped at {@link MAX_NOTES}); `priorCount` is how many note lines the agent's
 * memory held before this snapshot (for the diff's unchanged count).
 */
export type AgentSnapshot = {
  /** The custom agent this snapshot is for (CustomAgentDef.name). */
  readonly agentName: string;
  /** The new durable notes to append; [] when nothing durable was revealed. */
  readonly additions: readonly string[];
  /** Count of existing note lines in the prior memory (pre-snapshot). */
  readonly priorCount: number;
};

/**
 * Split a prior-memory blob into its existing note lines (non-empty, trimmed).
 * Each line is control-stripped + collapsed so dedupe compares like-for-like
 * with freshly cleaned candidate notes. Pure.
 */
function priorNoteLines(priorMemory: string): string[] {
  return priorMemory
    .split("\n")
    .map((l) => controlStrip(l))
    .filter((l) => l.length > 0);
}

/**
 * Build a proposed {@link AgentSnapshot} from a custom-agent session (PURE).
 *
 * Distils up to {@link MAX_NOTES} durable one-line notes from `sessionNotes`
 * (the `summary` first, then `keyFacts` in order). Each note is control-stripped
 * and capped. A note already present in `priorMemory` is NOT re-added (dedupe,
 * case-insensitive), and duplicates within the same session collapse. When
 * nothing durable survives (empty input, or every candidate already known),
 * `additions` is [] — nothing learned = no snapshot (no spurious update).
 */
export function buildAgentSnapshot(
  agentName: string,
  sessionNotes: SessionNotes,
  priorMemory = "",
): AgentSnapshot {
  const priorLines = priorNoteLines(priorMemory);
  const known = new Set(priorLines.map((l) => l.toLowerCase()));
  const additions: string[] = [];
  const candidates = [sessionNotes.summary, ...(sessionNotes.keyFacts ?? [])];
  for (const raw of candidates) {
    if (additions.length >= MAX_NOTES) break;
    const note = cleanNote(raw);
    if (note.length === 0) continue; // empty/whitespace-only → not durable
    const key = note.toLowerCase();
    if (known.has(key)) continue; // already in prior memory or this session
    known.add(key);
    additions.push(note);
  }
  return { agentName: controlStrip(agentName), additions, priorCount: priorLines.length };
}

/** True when a snapshot proposes at least one new note. Pure. */
export function hasSnapshot(snapshot: AgentSnapshot): boolean {
  return snapshot.additions.length > 0;
}

/** A diff preview for the operator confirm dialog: the new notes + the count of
 *  existing notes left untouched. */
export type SnapshotDiff = {
  /** The new note lines that would be appended. */
  readonly added: readonly string[];
  /** How many existing note lines stay unchanged. */
  readonly unchanged: number;
};

/**
 * Build the diff preview the operator confirms before any write (PURE).
 * `added` is the snapshot's proposed notes; `unchanged` is the count of existing
 * note lines in `priorMemory` (none are modified or removed — append-only).
 */
export function snapshotDiff(snapshot: AgentSnapshot, priorMemory = ""): SnapshotDiff {
  return { added: snapshot.additions, unchanged: priorNoteLines(priorMemory).length };
}

/**
 * Apply a snapshot to the prior memory text, returning the NEW memory text
 * (PURE — returns the string, does NOT write to disk; the write is the
 * operator-confirmed boundary). Appends each addition as its own line after the
 * existing content (preserved verbatim). Nothing to add → the prior text
 * unchanged. Idempotent: re-applying the same snapshot whose additions are
 * already present (buildAgentSnapshot dedupes against this same memory) is a
 * no-op, because such a re-built snapshot has `additions: []`.
 */
export function applySnapshot(priorMemory: string, snapshot: AgentSnapshot): string {
  if (snapshot.additions.length === 0) return priorMemory;
  const base = priorMemory.replace(/\s+$/, "");
  const appended = snapshot.additions.join("\n");
  return base.length === 0 ? appended : `${base}\n${appended}`;
}
