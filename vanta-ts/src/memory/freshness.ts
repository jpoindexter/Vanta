// CC-MEM-FRESHNESS: stale-memory caveats. Memories are point-in-time
// observations; file:line citations in an old block may no longer match the
// code. Fresh blocks (today/yesterday) inject nothing; older blocks get a
// one-line staleness note so the agent re-verifies before trusting them.
//
// All pure: `ageMs` is injected (caller passes `now - timestamp`). No Date.now()
// inside — keeps the module deterministic and testable.

const DAY_MS = 86_400_000;
// Caveat threshold: today AND yesterday are "fresh" (no note), per the DONE
// criterion. So the caveat starts at age >= 2 days, not >= 1.
const FRESH_MAX_MS = 2 * DAY_MS;

/**
 * Human-readable age of a memory block. "today" (< 1 day, also absorbs a
 * future/clock-skew timestamp), "yesterday" (1 day), else "N days ago".
 */
export function humanAge(ageMs: number): string {
  const days = Math.floor(ageMs / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/**
 * The staleness caveat for a memory of the given age, or null when fresh.
 * Fresh = today or yesterday (age < 2 days). Older → a one-line note pointing
 * the agent to re-verify the memory against current code.
 */
export function freshnessCaveat(ageMs: number): string | null {
  if (ageMs < FRESH_MAX_MS) return null;
  return `[memory is ${humanAge(ageMs)} — point-in-time observation; verify file:line citations against current code]`;
}

/**
 * Prepend the staleness caveat (+ newline) to a memory block when it is stale;
 * return the content unchanged when fresh. Pure — caller supplies the age.
 */
export function annotateMemory(content: string, ageMs: number): string {
  const caveat = freshnessCaveat(ageMs);
  return caveat ? `${caveat}\n${content}` : content;
}
