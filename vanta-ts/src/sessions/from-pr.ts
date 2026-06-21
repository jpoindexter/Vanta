// VANTA-FROM-PR — `vanta --from-pr <n|url>` resumes the session linked to a PR.
//
// Given a PR number or URL, resolve the PR's HEAD BRANCH, match it against past
// sessions, and resume the newest match — so work picks up where the PR's session
// left off. Everything here is PURE + injectable: the PR-ref parse, the
// session→branch match, and the resolve orchestration are unit-tested with no real
// `gh`/git process and no real fs. The live `gh`/git lookup of the PR's head branch
// is the documented boundary — it's injected as `getPrBranch`.
//
// MATCH KEY (important — read before changing). A session does NOT record its git
// branch: `SessionMeta` (sessions/store.ts) is
// `{id, title, started, updated, projectId, turns}` — no `branch`, no `cwd`. The
// card forbids adding one to store.ts this round, so we match on the AVAILABLE
// field that best stands in for a branch: the session TITLE (derived from the first
// user message, which is where a branch's goal slug originates). The match is
// applied through an injected `sessionBranch(session)` accessor that DEFAULTS to the
// title, so the day `SessionMeta` gains a real `branch` field the only change is to
// pass `(s) => s.branch ?? s.title` — no rewrite here.
//
// FOLLOW-UP (named, not done): record the working branch on `SessionMeta` (a
// `branch?: string` on the Session schema in sessions/store.ts, set from
// `git rev-parse --abbrev-ref HEAD` at save time). That turns this from a
// title-proxy match into an exact branch match. Out of scope for this card.
//
// LIVE WIRE POINT (named, not wired — clarity-gate). The resume path
// (cli.ts → the `--from-pr` branch, alongside `--resume`/`resume <id>`) would:
//   1. parse the flag value with `parsePrArg` → `{ number }` | null (null → usage
//      error: "expected a PR number or URL");
//   2. call `resolveSessionForPr({ prNumber, getPrBranch, listSessions })` where
//      `getPrBranch` runs the live `gh pr view <n> --json headRefName -q .headRefName`
//      (the boundary) and `listSessions` is sessions/store.ts `listSessions`;
//   3. a non-null id → resume it via the existing resume machinery
//      (`loadSession` + `createConversation(..., { history })`, same as `resume <id>`);
//   4. a null id → print `formatNoSessionForPr(prNumber)` and start a fresh session.

import { parsePrUrl } from "../batch/batch.js";
import type { SessionMeta } from "./store.js";

/** A parsed PR reference — just its number (the only field we need to look it up). */
export type PrRef = { number: number };

/** Pull the PR number out of a GitHub PR URL's `/pull/<n>` segment. Null if absent. */
function prNumberFromUrl(url: string): number | null {
  const m = /\/pull\/(\d+)/.exec(url);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Pure: parse a `--from-pr` argument into a {@link PrRef}, or null on garbage.
 *
 * Accepts two forms:
 *  - a BARE NUMBER — `"12"`, `" 12 "`, or `"#12"` → `{ number: 12 }`;
 *  - a PR URL — `https://github.com/o/r/pull/12` (any host) → `{ number: 12 }`. The
 *    URL token is first canonicalized via the reused {@link parsePrUrl} (the same
 *    helper `vanta batch` uses to pluck the PR URL out of `gh` output), then the
 *    `/pull/<n>` number is extracted from it.
 *
 * Returns null for anything that isn't a positive integer PR ref: empty, non-numeric
 * text, a zero/negative number, a non-integer, or a URL with no `/pull/<n>` segment.
 * Never throws — it's an untrusted CLI-arg boundary.
 */
export function parsePrArg(arg: string): PrRef | null {
  const trimmed = arg.trim();
  if (!trimmed) return null;

  // URL form first: anything containing "://" is a URL. Reuse parsePrUrl to extract
  // the http(s) token, then read its /pull/<n> number (null for e.g. an issue URL).
  if (trimmed.includes("://")) {
    const url = parsePrUrl(trimmed);
    if (url === null) return null;
    const n = prNumberFromUrl(url);
    return n !== null ? { number: n } : null;
  }

  // Bare-number form: an optional leading "#", then digits only. A leading "-" makes
  // the digit test fail (negatives are rejected), as does any non-digit char.
  const digits = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  return Number.isInteger(n) && n > 0 ? { number: n } : null;
}

/**
 * Maps a session to the branch string it's matched on. DEFAULT = the session title
 * (the documented match key — see the module header). Injectable so a caller can
 * swap in a real branch once `SessionMeta` records one, without touching match logic.
 */
export type SessionBranch = (session: SessionMeta) => string;

/** The default {@link SessionBranch}: the session title (no recorded branch today). */
export const defaultSessionBranch: SessionBranch = (session) => session.title;

/**
 * Pure: normalize a branch/title for comparison — lowercase + trim + collapse inner
 * whitespace. Empty/whitespace-only → "". Used on BOTH sides of the match so case
 * and stray whitespace never cause a miss.
 */
function normalizeBranch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Pure: the sessions whose recorded branch matches `branch`, NEWEST FIRST.
 *
 * Newest-first is a GUARANTEE of this function, not an assumption about input order:
 * matches are sorted by `updated` descending (the same key `listSessions` sorts on),
 * so the first element is always the most recent match regardless of the input order.
 * The branch each session is compared on comes from `sessionBranch` (default: the
 * title — the documented proxy). A blank target branch, or no match, → `[]`.
 *
 * @param sessions session metadata in any order.
 * @param branch the PR's head branch to match against.
 * @param sessionBranch how to read a session's branch (default: its title).
 */
export function matchSessionsToBranch(
  sessions: readonly SessionMeta[],
  branch: string,
  sessionBranch: SessionBranch = defaultSessionBranch,
): SessionMeta[] {
  const target = normalizeBranch(branch);
  if (!target) return [];
  return sessions
    .filter((s) => normalizeBranch(sessionBranch(s)) === target)
    .sort((a, b) => b.updated.localeCompare(a.updated));
}

/** Injected dependencies for {@link resolveSessionForPr}. */
export type ResolvePrDeps = {
  /** The PR number to resolve (already parsed via {@link parsePrArg}). */
  prNumber: number;
  /**
   * The live, boundary lookup of a PR's HEAD branch — e.g. `gh pr view <n> --json
   * headRefName`. Injected so the resolve logic is fully testable with no real
   * process. May reject or resolve null/""; resolveSessionForPr swallows all of
   * those into a clean null (never throws through).
   */
  getPrBranch: (prNumber: number) => Promise<string | null>;
  /** Lists session metadata newest-first (sessions/store.ts `listSessions`). */
  listSessions: () => Promise<SessionMeta[]>;
  /** How to read a session's branch (default: its title — the documented proxy). */
  sessionBranch?: SessionBranch;
};

/**
 * Resolve the best session id to resume for a PR, or null. Errors-as-values: NEVER
 * throws.
 *
 * Steps: look up the PR's head branch via `getPrBranch`; if it's absent (null/"" or
 * the lookup throws) → null. Otherwise list sessions, match them to that branch
 * (newest-first), and return the newest match's id, or null when nothing matches.
 *
 * A null return is the "no session for PR #n" signal — the caller pairs it with
 * {@link formatNoSessionForPr} and can start a fresh session.
 */
export async function resolveSessionForPr(deps: ResolvePrDeps): Promise<string | null> {
  let branch: string | null;
  try {
    branch = await deps.getPrBranch(deps.prNumber);
  } catch {
    return null; // boundary failure (gh not authed, no network, …) → no match.
  }
  if (!branch || !branch.trim()) return null;

  const sessions = await deps.listSessions();
  const matches = matchSessionsToBranch(sessions, branch, deps.sessionBranch);
  return matches[0]?.id ?? null;
}

/**
 * Pure: the message shown when no session is linked to a PR, inviting a fresh start.
 * e.g. `no session for PR #12 — start fresh?`
 */
export function formatNoSessionForPr(prNumber: number): string {
  return `no session for PR #${prNumber} — start fresh?`;
}
