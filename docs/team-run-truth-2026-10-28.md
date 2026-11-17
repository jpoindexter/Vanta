# Team-run truth and Stop — 2026-10-28

**Source checkpoint evidence.** At this checkpoint the installed app/normal CLI
still contained `7d32e58f`. The subsequent [agent5 delivery](agent5-installed-2026-10-28.md)
executes these bounded journeys against candidate and installed code `166aff7f`.

## Cause and bounded repair

The registered `team` tool's `run` adapter ignored a child's stopped reason,
completion state and effect-review requirement. Even kernel spawn refusal could
become a durable task marked done and an `ok:true` tool result. Task settlement
also hid review/artifact rejection and fabricated an assumed source status.
Foreground cancellation was not forwarded to the child.

Reuse the existing `workerToolResult` contract, forward the foreground signal,
and report done only after the legal ledger transition succeeds. Reread the
latest task before a transition; keep already-stopped/removed records intact.
Child/settlement failure stays unknown and unverified, not proof of no effects.
Failure wording does not claim a blocked ledger state when it could not be saved.
No kernel, policy, approval option or retry behavior is changed.

## Executed evidence

Private worker packet: `docs/Vanta-backups/team-truth-20261028-8FTw9v`.
Parent evidence: `docs/Vanta-backups/team-truth-parent-20261028-tHQgod`.

- Twelve regressions fail on the original adapter. Final serial focused run:
  **76 checks across seven files**, types and strict size pass. A prior final-byte
  run had one adjacent background-custody timeout and cleanup ENOTEMPTY (75/76).
  That failure is retained; the subsequent single serial pass does not explain
  or fix its intermittent cause. No test timeout or assertion was weakened.
- Parent independently runs **37 checks across four files** on final bytes,
  including actual team ledger, foreground Stop and architecture boundaries.
- Real source CLI ACP, registry, agent, loopback provider and unchanged Rust gate:
  `deny-I28XO7` records depth 7 refused at ceiling 6, one parent/zero child model
  calls, task blocked, unknown/unverified team receipt, no follower write and ACP
  refusal. `success-ye4fxv` records ordinary completion, three total model calls,
  task done and the expected follower write. Existing child sidechain usage 20/10
  is retained; this is not a parent usage-accounting repair.
- `cancel-TW7eDH` holds the real child request, sends Cancel and then returns a
  write tool call. Parent cancellation settles in **193 ms**, with two model
  requests, no child-after-stop or follower file, task blocked and unknown receipt.
  All three actual CLI runs exit naturally at EOF with code 0. Only their own
  kernels/listeners are stopped. Exact source hashes are checked before/after.

The model replies and task seed are private fixtures, not owner accounts or paid
models. No packaged/installed UI or complete background-workflow acceptance is
inferred. Already-observed effects are not rolled back by Stop.

## Remaining gates

Rereading is not an atomic cross-process compare-and-append; concurrent writers
can still race between the read and append. Other foreground adapters, running
swarm siblings, review-clear, full earned authority, owner accounts and whole
Desktop parity remain open. Ordinary child done is still unverified unless the
existing artifact/review gate supplies evidence. The adjacent custody timeout
remains an explicit diagnostic limit, not a silently cleared defect.

Original work and rollback remain preserved. [Old generated-build cleanup](old-build-cleanup-2026-10-28.md)
restores delivery headroom without deleting source or the installed app. No main
merge, public release/tag, CI, paid service or broad card closure occurs here.
