# Background continuity and authenticated worker launch — 2026-10-27

## Boundary first

This is a bounded source checkpoint, not whole-agent, live-account or Desktop
delivery acceptance. Normal CLI pin and installed app retain their separately
recorded versions until delivery checks run. The unchanged Rust kernel and its
policies are not modified. No credential or approval authority is migrated.

## Repairs

- Detached workers retain typed outcomes in the existing append-only queue.
  Durable custody precedes launch; delivery is claimed before invoking the
  parent and acknowledged only after a completed typed parent outcome.
- Unknown, incomplete, conflicting, malformed, legacy and interrupted deliveries
  hold automatic followers rather than replaying or guessing success from prose.
  Live conversation uncertainty survives compaction; typed restored history seeds
  the hold. Explicit manual input remains available.
- The actual readline turn returns its outcome. Incomplete turns retain printed
  text, usage and session saving, but skip automatic goal/hook continuations.
- Worker launches authenticate `/api/spawn` using the existing project/profile
  token resolver. HTTP rejection, malformed responses, connection failure and a
  five-second timeout refuse launch instead of silently allowing shallow workers.
- Existing delegate, fleet and auto-research worktree adapters bind spawn
  authentication to their parent kernel identity while retaining the separate
  worker filesystem root and the existing safety client. This does not authorize
  file access outside the parent's approved scope.

## Executed evidence

The parent combined checkout passes **81 focused tests in 13 files**, runtime
typecheck, exact worker postimage checks and strict size analysis of all 21
changed code/test files. The shared delegate file contains both reviewed changes;
its combined source digest is retained separately. No broad suite was run.

Independent real conversation/readline proofs execute a tiny private partial
file effect followed by a normally resolved blocked result: one provider/action,
no delivery acknowledgment and no automatic follower. Live prior uncertainty and
typed history restoration hold before another model call. A final predicate
widening additionally holds a pre-aborted live conversation with zero provider,
effect or delivery claims. Earlier evidence retains its own source hashes.

The background worker's 67 selected source checks also cover ordinary once-only
delivery, explicit manual input, failed initial/terminal persistence, malformed
records, conflicting duplicates and pending crash claims. A separate actual
consumer process exits after a partial effect before acknowledgment; repeated
cold reads preserve the claim and do not replay its follower.

The authenticated-spawn worker's 64 selected checks and unchanged real Rust
execution cover default and named profiles. Baseline unauthorized requests
produced no spawn ledger records but falsely allowed shallow workers. The repair
produces four correct allow/deny records per scope, refuses excessive depth
before provider access, and refuses stopped/unresponsive services. Separate-root
file access still requires approval; denial preserves the fixture's exact bytes.
A final independently identified missing-default-token case now refuses before
fetch or provider access, including a successful-looking unauthenticated response.

Private packets: `agent-rebuild-delivery-20261027-exFA28`,
`background-outcome-v2-20261027-fLtAKq`,
`background-outcome-v2-review-20261027-WZBeJ5`,
`background-child-review-20261027-3etB2W`, and
`spawn-auth-20261027-JWnwQv` and `spawn-auth-v2-20261027-sBiczg`.
Original V1 evidence remains intact and is not
promoted as proof of the corrected normally-resolving parent path.

## Remaining limits

There is no review-clear operation; conservative holds must not be bypassed by
deleting the queue. Historical uncertainty whose typed evidence was already
lost through old compaction cannot be reconstructed. Running-sibling cancellation,
complete session continuity, all background hosts, earned capability envelopes,
live accounts and whole-card acceptance remain separate. No Rust/policy edits,
main merge, release/tag, CI or paid service occurred. All 239 original work-file
hashes and the current 57-file owner app-data backup remain unchanged.
