// CC-DIAGNOSTIC-BASELINE wiring helper. Straddles a file write to surface only
// the TS diagnostics the write INTRODUCED. Unlike the size gate (a pure
// post-write check on the new content), diagnostics are read from DISK — so the
// baseline must be captured BEFORE the write lands and the after-pass AFTER.
//
// `beginDiagnosticDelta` returns a `finish()` closure: call it before writing,
// invoke the closure after. Best-effort throughout — any failure yields "" and
// never breaks the write. Crucially, if BASELINE capture fails we suppress the
// note entirely (return "") rather than reporting every pre-existing diagnostic
// as new. Only a genuinely-empty baseline (a new file) surfaces all-as-new.

import type { Diag } from "./diagnostic-delta.js";
import { diffDiagnostics, formatNewDiagnostics } from "./diagnostic-delta.js";
import { getDiagnostics } from "./ts-service.js";

// Mirror the size gate's eligibility: .ts/.tsx only; .d.ts + test files exempt.
function isEligible(abs: string): boolean {
  return /\.tsx?$/.test(abs) && !/\.(d|test)\.tsx?$/.test(abs);
}

/** Drop the `character` field — the delta module keys on (message, category). */
function asDiags(abs: string): Diag[] {
  return getDiagnostics(abs).map((d) => ({
    line: d.line,
    message: d.message,
    category: d.category,
  }));
}

/**
 * Capture baseline diagnostics, then return a `finish()` that captures the
 * after-state and returns the formatted delta note (or "" — see module doc).
 *
 * @param abs absolute path being written
 * @param isExisting whether the file existed pre-write (new file → empty baseline)
 */
export async function beginDiagnosticDelta(
  abs: string,
  isExisting: boolean,
): Promise<() => Promise<string>> {
  if (!isEligible(abs)) return async () => "";
  let before: Diag[];
  try {
    before = isExisting ? asDiags(abs) : [];
  } catch {
    return async () => ""; // baseline failed → never report stale issues as new
  }
  return async () => {
    try {
      return formatNewDiagnostics(diffDiagnostics(before, asDiags(abs)));
    } catch {
      return "";
    }
  };
}
