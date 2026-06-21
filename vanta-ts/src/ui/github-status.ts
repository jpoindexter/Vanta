// VANTA-STATUS-LINE-GITHUB — compact GitHub context for the status line.
//
// Pure parse + format + a best-effort gather. The live `gh`/`git` invocations
// are the documented boundary: `gatherGithubStatus` takes injected runners so
// every code path is unit-tested with no real git/gh. No repo, no gh, or a
// failed fetch → nothing is shown (an empty status / an empty chip) — never a
// fabricated value, matching the rest of the rich status segments.
//
// Where this renders: ui/status-bar.tsx composes the footer chips; a github
// chip would slot in there as a RichSegment (see ui/status-segments.ts
// composeRichSegments) by calling formatGithubStatus(status) on a gathered
// GithubStatus. This round delivers the pure layer only; the live fetch + the
// status-bar wire are deferred (the boundary).

/** The PR fields we surface, derived from `gh pr view --json ...`. */
export type GithubPr = {
  number: number;
  state: string;
  /** APPROVED / CHANGES_REQUESTED / REVIEW_REQUIRED / "" — absent when unknown. */
  reviewDecision?: string;
};

/** Compact GitHub context for the status line. All fields optional: any piece
 *  that couldn't be derived is simply omitted (no repo → render nothing). */
export type GithubStatus = {
  /** "owner/name" from the origin remote. */
  repo?: string;
  /** Current branch (symbolic ref short name). */
  branch?: string;
  /** Open PR for the branch, when one exists. */
  pr?: GithubPr;
};

/** Runs `git <args>` in the repo; resolves the trimmed stdout. May reject. */
export type RunGit = (args: string[]) => Promise<string>;
/** Runs `gh <args>` in the repo; resolves the trimmed stdout. May reject. */
export type RunGh = (args: string[]) => Promise<string>;

// Strip ANSI escapes + C0/C1 control chars (incl. ESC/BEL/newlines) so a remote
// URL or branch name can never inject an escape sequence into the chip, then
// collapse whitespace runs. Mirrors ui/agent-identity.ts / term/terminal-title.
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x1f\x7f-\x9f]/g;

/** Control-strip a display field: drop ANSI + control chars, collapse spaces. */
function stripDisplay(value: string): string {
  return value.replace(ANSI, "").replace(CONTROL, " ").replace(/\s+/g, " ").trim();
}

/**
 * "owner/name" from a git remote URL. Handles the GitHub https
 * (`https://github.com/owner/name(.git)`) and ssh (`git@github.com:owner/name(.git)`,
 * `ssh://git@github.com/owner/name`) forms. Returns null for any non-GitHub or
 * unparseable URL — so a non-GitHub remote shows nothing.
 */
export function parseRepoSlug(remoteUrl: string): string | null {
  const url = remoteUrl.trim();
  // github.com/<owner>/<name> appears in every supported form after the host;
  // capture the two path segments, tolerating a trailing .git and slashes.
  const match = url.match(/github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  if (!match) return null;
  const owner = match[1];
  const name = match[2];
  if (!owner || !name) return null;
  return `${owner}/${name}`;
}

type RawPr = { number?: unknown; state?: unknown; reviewDecision?: unknown };

/**
 * The PR fields from `gh pr view --json number,state,reviewDecision` output.
 * Tolerant: returns null on empty input, `[]` (gh prints an empty array when no
 * PR), invalid JSON, or a missing number — so no PR shows nothing. An object or
 * a one-element array are both accepted (gh's two output shapes).
 */
export function parsePrJson(ghJson: string): GithubPr | null {
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
  const { number, state, reviewDecision } = raw as RawPr;
  if (typeof number !== "number") return null;
  const pr: GithubPr = { number, state: typeof state === "string" ? state : "" };
  if (typeof reviewDecision === "string" && reviewDecision) pr.reviewDecision = reviewDecision;
  return pr;
}

// Compact glyph per gh reviewDecision. Unknown/absent → no glyph (just "#12").
const REVIEW_GLYPH: Record<string, string> = {
  APPROVED: " ✓approved",
  CHANGES_REQUESTED: " ✗changes",
  REVIEW_REQUIRED: " review",
};

function prPart(pr: GithubPr): string {
  const glyph = REVIEW_GLYPH[pr.reviewDecision ?? ""] ?? "";
  return ` · PR #${pr.number}${glyph}`;
}

/**
 * The compact chip: "⎇ owner/name@branch · PR #12 ✓approved". The branch and PR
 * parts are added only when present. Returns "" when there is no repo (nothing
 * to anchor the chip), so the segment is omitted. Display fields are
 * control-stripped (no escape injection from a remote/branch name).
 */
export function formatGithubStatus(status: GithubStatus): string {
  const repo = status.repo ? stripDisplay(status.repo) : "";
  if (!repo) return "";
  const branch = status.branch ? stripDisplay(status.branch) : "";
  const repoPart = branch ? `${repo}@${branch}` : repo;
  const pr = status.pr ? prPart(status.pr) : "";
  return `⎇ ${repoPart}${pr}`;
}

async function tryRun(run: (args: string[]) => Promise<string>, args: string[]): Promise<string | null> {
  try {
    const out = (await run(args)).trim();
    return out || null;
  } catch {
    return null;
  }
}

/**
 * Best-effort GitHub context from injected `git`/`gh` runners. Each lookup is
 * isolated: a thrown or empty runner result drops that field rather than
 * failing the whole gather, and the function never throws (a thrown runner → an
 * empty/partial status). No GitHub remote → no PR lookup (repo stays unset).
 */
export async function gatherGithubStatus(deps: { runGit: RunGit; runGh: RunGh }): Promise<GithubStatus> {
  const status: GithubStatus = {};
  const remote = await tryRun(deps.runGit, ["remote", "get-url", "origin"]);
  const slug = remote ? parseRepoSlug(remote) : null;
  if (slug) status.repo = slug;
  const branch = await tryRun(deps.runGit, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch) status.branch = stripDisplay(branch);
  // Only ask gh about a PR when this is a GitHub repo — otherwise there's
  // nothing to attach a PR to and the gh call would be wasted.
  if (status.repo) {
    const prJson = await tryRun(deps.runGh, ["pr", "view", "--json", "number,state,reviewDecision"]);
    const pr = prJson ? parsePrJson(prJson) : null;
    if (pr) status.pr = pr;
  }
  return status;
}
