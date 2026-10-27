# Uncertain action settlement — source checkpoint, 2026-10-27

## Direction and boundary

Keep the current Desktop as the working baseline: maintenance, delivery and agent
blockers only. This slice repairs direct agent execution and the existing Desktop
host's truth/recovery path; it is not more UI polish or complete agent autonomy.

## Behavior

- Record an unknown effect in turn-owned state before settlement awaits. Stop
  later batch tools and further model iterations, retain partial text and reported
  usage, and return blocked / needs human with an additive `needsEffectReview`
  marker. Ordinary unverified answers and successful reads still finish normally.
- Preserve that marker through HTTP/SSE terminal reasons, saved session receipts,
  captured runs and legacy projections. Offer editing, not blind Retry or Replay.
- Retain held queue items. Before queue claims, consult existing queue, session
  and captured-run evidence. Two failed queue-pause writes cannot erase a saved
  review requirement; receipt-free transcript compaction does not unblock replay.
- A marked workflow subagent cannot become a successful next node. The existing
  conservative gateway also propagates the uncertain result to its outer agent.
- Extract existing run schemas and public library types into cohesive modules,
  preserving validation and old-path exports. No authority or dependency changes.

## Executed evidence

Parent packet: `unknown-effect-parent-20261027-gw4lZP`. Frozen reviewed V3:
`unknown-effect-settlement-v3-20261027-gF9EvM`; patch SHA256
`86ff0ceb4149b9c54a49e3fbcb6ca1fcf6de35f8f5744f147d4ddfab8a399e26`.

The parent ran 50 focused checks in 11 files, the existing owned interrupted-
mutation case, and runtime typecheck. All passed; 12 unrelated cases in that
legacy test file were deliberately not run. The legacy case now expects a halt
and retained receipt rather than a second model call claiming completion.

The parent also executed actual runTurn → stdio child → MCP client → mapped tool
→ journal: one private partial effect, one provider call, no second batch action,
unknown/unverified durable receipt, needs-human outcome and retained usage 15/4.
The model and safety allow decision are controlled fixtures, not a live account
or Rust approval-path proof. This jointly uses the current disconnect correction.

Independent review (`unknown-effect-review-20261027-10j2Ih`) reproduced V1's cold
replay and verified V2's refusal from both saved-session and captured-run evidence.
Actual outer workflow dispatch also stopped after one child/model call without
running a later parent tool; 16 independently focused checks passed. V3 changes
only the reviewed type extraction. Rejected V1 and intermediate V2 remain intact.

## Limits and delivery

This is source proof, not a new installed app or normal CLI delivery. The existing
Terminal entry also needs its startup-cache asset correction before selection.
Owner approval permits a pinned CLI switch only after verification, with old
checkout/work/selection retained and no credential or approval migration.

No review-clear operation is invented: retained uncertainty conservatively holds
that session's queue, even after an ordinary manual turn. Cancellation/removal
remains available; model prose cannot clear the hold. Nested delegate, swarm and
background/scheduled adapters still need their own propagation proof. Already-
started parallel workflow branches are not cancelled or rolled back. Simultaneous
loss of every durable evidence store and historical receipt repair are not solved.
No main merge, release/tag, paid workflow or whole-card completion is claimed.
