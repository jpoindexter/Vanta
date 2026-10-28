# Cross-host uncertain-action continuity — 2026-10-28

## Scope

Source-only supporting repair for TRUST-03 T03-2 and OP-03. It does not close
either parent or add a review-clear operation. No authority, retry, journal,
credential, transport or kernel policy changes.

## Reproduced failure

The agent's restored-history check recognized typed tool results with
`effectDisposition: unknown`. Desktop queue admission recognized only assistant
messages carrying `desktopRun.needsEffectReview`. A saved CLI session can contain
the former without the latter.

The real registered Gmail tool, conversation and unchanged Rust kernel were run
against private OAuth/Gmail HTTP fixtures. After one fresh fixture approval and
one Gmail submission returning HTTP 503, the session was saved without any
Desktop receipt. A fresh Desktop server/state then received an authenticated
`POST /api/chat` requesting queue resumption. Before the repair it returned 200,
executed the queued follower and reported done despite the retained uncertainty.
Three focused live/resuming/saved-evidence cases also failed before the change.

## Small shared repair

Export the agent's existing typed-message predicate and reuse it in Desktop
queue admission for live, resuming and saved histories. Keep the existing queue,
saved Desktop receipt and captured-run checks. Prose is not evidence; a confirmed
tool result or ordinary unverified answer creates no new hold.

This removes a duplicated, narrower interpretation rather than adding a second
state store or a new resolver. Ordinary manual input remains available. A queued
follower is not permission to repeat an uncertain action.

## Executed evidence

Private retained packet: `queue-review-continuity-20261028-Ou8lVN`.

- RED: actual registered Gmail/conversation/kernel → save session → fresh
  Desktop HTTP server admitted the follower with 200 and one extra model call.
- GREEN: the same route returns 409 with the review instruction, before any
  follower model call; the exact queued record remains unchanged.
- The independent chat in the same project completes its queued question with
  200 and leaves the held chat unchanged.
- A manual question in the affected chat returns 200 without draining its
  follower. Total fixture submissions and approvals remain exactly one each;
  the exact draft bytes remain intact.
- 32 focused checks across four files pass: effect-review, Desktop settlement,
  turn queue and queue restart. Native TypeScript passes; strict size analysis
  of the four changed source/test files reports zero violations; all five
  architecture boundaries pass.

## Limits

This is source HTTP evidence with a scripted model and local fixture account,
not a new packaged/installed build, a real mailbox, owner authorization or a
full cold-process restart acceptance. The server/state is recreated in the same
proof process; that distinction is deliberate. Existing queue-restart tests do
not turn this into installed restart proof.

Canonical evidence-bound resolution/clearing, expiry, old merged-record repair,
loss of all durable evidence and the parent quality thresholds remain open.
Normal CLI e467a857, installed agent14 and unrelated original work stay unchanged.
No main merge, public release/tag, paid service or legacy retirement.
