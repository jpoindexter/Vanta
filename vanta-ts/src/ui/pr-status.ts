// VANTA-PR-STATUS-POLL — live PR review state during a session.
//
// Pure parse + format + a best-effort poll. The live `gh pr view --json ...`
// invocation is the documented boundary: `pollPrStatus` takes an injected
// runner so every code path is unit-tested with no real gh process. No PR, a gh
// failure, or garbage output → a clean null ("no PR status") — never a
// fabricated state, mirroring ui/github-status.ts.
//
// Where this renders: the session status line (ui/status-bar.tsx, via a
// RichSegment in ui/status-segments.ts composeRichSegments) and a `/pr` slash
// command (repl/handlers.ts would call pollPrStatus then formatPrStatusLine on
// the gathered PrStatus, mirroring how /reach or /goals print a gathered view).
// This round delivers the pure layer only; the live gh call + the status-bar /
// /pr wire are deferred (the boundary), matching VANTA-STATUS-LINE-GITHUB.

/** Rolled-up CI check counts from `statusCheckRollup`. */
export type PrChecks = {
  passing: number;
  failing: number;
  pending: number;
};

/** The PR fields we surface, derived from `gh pr view --json ...`. */
export type PrStatus = {
  number: number;
  /** Control-stripped PR title (untrusted text). Omitted when absent. */
  title?: string;
  /** OPEN / CLOSED / MERGED (gh's `state`), or "" when unknown. */
  state: string;
  /** APPROVED / CHANGES_REQUESTED / REVIEW_REQUIRED — absent when unknown. */
  reviewDecision?: string;
  /** Rolled-up CI check counts. */
  checks: PrChecks;
  /** gh's `mergeable` (MERGEABLE / CONFLICTING / UNKNOWN) — absent when unknown. */
  mergeable?: string;
};

/** Runs `gh <args>`; resolves the trimmed stdout. May reject / be non-zero. */
export type RunGh = (args: string[]) => Promise<string>;

// Strip ANSI escapes + C0/C1 control chars (incl. ESC/BEL/newlines) so an
// attacker-chosen PR title can never inject an escape sequence into the status
// line, then collapse whitespace runs. Mirrors ui/github-status.ts stripDisplay.
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x1f\x7f-\x9f]/g;

/** Control-strip a display field: drop ANSI + control chars, collapse spaces. */
function stripDisplay(value: string): string {
  return value.replace(ANSI, "").replace(CONTROL, " ").replace(/\s+/g, " ").trim();
}

// A statusCheckRollup entry is either a CheckRun (has `conclusion`/`status`) or
// a StatusContext (has `state`). We classify each into passing/failing/pending.
type RollupEntry = {
  status?: unknown;
  conclusion?: unknown;
  state?: unknown;
};

const PASS_VALUES = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const FAIL_VALUES = new Set(["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"]);

/** Map one verdict word (CheckRun.conclusion or StatusContext.state) to a
 *  bucket. Unknown/absent → pending (never silently "passing"). */
function classifyVerdict(verdict: unknown): keyof PrChecks {
  if (typeof verdict !== "string" || !verdict) return "pending";
  const upper = verdict.toUpperCase();
  if (PASS_VALUES.has(upper)) return "passing";
  if (FAIL_VALUES.has(upper)) return "failing";
  return "pending";
}

/** Classify one rollup entry. CheckRun carries its terminal verdict in
 *  `conclusion` (absent = still running → pending); StatusContext in `state`. */
function classifyEntry(entry: RollupEntry): keyof PrChecks {
  const verdict = typeof entry.conclusion === "string" && entry.conclusion ? entry.conclusion : entry.state;
  return classifyVerdict(verdict);
}

/** Roll a `statusCheckRollup` array into passing/failing/pending counts. A
 *  non-array (gh emits an empty array when there are no checks) → all zero. */
function rollChecks(rollup: unknown): PrChecks {
  const checks: PrChecks = { passing: 0, failing: 0, pending: 0 };
  if (!Array.isArray(rollup)) return checks;
  for (const raw of rollup) {
    if (!raw || typeof raw !== "object") continue;
    checks[classifyEntry(raw as RollupEntry)] += 1;
  }
  return checks;
}

type RawPr = {
  number?: unknown;
  title?: unknown;
  state?: unknown;
  reviewDecision?: unknown;
  statusCheckRollup?: unknown;
  mergeable?: unknown;
};

/** Parse `ghJson` to a RawPr object, tolerant of gh's two output shapes (a bare
 *  object or a one-element array). Returns null on empty/invalid/non-object. */
function parseRawPr(ghJson: string): RawPr | null {
  const text = ghJson.trim();
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const raw = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!raw || typeof raw !== "object") return null;
  return raw as RawPr;
}

/** Assign the optional string fields (title control-stripped) onto `status`. */
function applyOptionalFields(status: PrStatus, raw: RawPr): void {
  if (typeof raw.title === "string" && raw.title.trim()) status.title = stripDisplay(raw.title);
  if (typeof raw.reviewDecision === "string" && raw.reviewDecision) status.reviewDecision = raw.reviewDecision;
  if (typeof raw.mergeable === "string" && raw.mergeable) status.mergeable = raw.mergeable;
}

/**
 * The PR fields from `gh pr view --json number,title,state,reviewDecision,
 * statusCheckRollup,mergeable` output. Tolerant: returns null on empty input,
 * `[]` (gh prints an empty array when there's no PR), invalid JSON, or a
 * missing number — so no PR shows nothing. An object or a one-element array are
 * both accepted (gh's two output shapes). The title is control-stripped.
 */
export function parsePrStatus(ghJson: string): PrStatus | null {
  const raw = parseRawPr(ghJson);
  if (!raw || typeof raw.number !== "number") return null;
  const status: PrStatus = {
    number: raw.number,
    state: typeof raw.state === "string" ? raw.state : "",
    checks: rollChecks(raw.statusCheckRollup),
  };
  applyOptionalFields(status, raw);
  return status;
}

// The display layer (glyphs/labels/segment ordering) lives in a sibling so this
// file stays the parse + poll concern. Re-exported here for a stable import path.
export { formatPrStatusLine } from "./pr-status-format.js";

const PR_VIEW_JSON_FIELDS = "number,title,state,reviewDecision,statusCheckRollup,mergeable";

/**
 * Best-effort live PR status from an injected `gh` runner. A thrown/non-zero/
 * empty runner result or no PR for the branch → null (never throws): the status
 * line / `/pr` command shows "no PR status" rather than a fabricated state.
 */
export async function pollPrStatus(deps: { runGh: RunGh }): Promise<PrStatus | null> {
  let out: string;
  try {
    out = (await deps.runGh(["pr", "view", "--json", PR_VIEW_JSON_FIELDS])).trim();
  } catch {
    return null;
  }
  if (!out) return null;
  return parsePrStatus(out);
}
