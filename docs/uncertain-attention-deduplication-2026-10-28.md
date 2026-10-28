# Uncertain-action attention identity — 2026-10-28

## Result and remaining gap

The source replay now merges repeated uncertainty for the same exact operation
set into one Needs You item with both receipts. It does not resolve the unknown
effect. **O03-3 remains incomplete:** evidence-bound resolution/clearing and its
other-chat isolation proof are still required. Installed agent14 and normal CLI
e467a857 do not contain this follow-up yet.

## Reproduced cause and change

The registered Gmail tool and unchanged kernel already prevented a second
submission when the same consumed operation was replayed. However, each terminal
agent turn received a random WorkItem ID: the operator view displayed two
blockers for that one uncertain operation. A retained actual Gmail503 fixture
and regression test both reproduced two items instead of one.

Turn-owned uncertainty now carries the exact operation IDs through the existing
state/outcome/receipt boundary, including interrupted batch and failed-checkpoint
paths. A session-bound unknown terminal receipt hashes its host and complete
sorted operation-ID set; the existing session and goal namespace remains intact.
Repeated observations append to that item's receipt timeline without temporarily
reporting it queued/running. Ordinary, unbound, different-host, different-goal,
different-chat and different-operation-set turns remain distinct.

This does not infer identity from similar prose, recipients or post bodies.
It does not merge partially overlapping operation sets, rewrite historical
random-ID records, change the effect claim, authorize a retry, clear conversation
holds or promote uncertainty to success. Raw operation IDs, tokens and draft
bodies do not enter the new attention ID.

## Executed evidence

- Before: actual conversation, registered gmail_send, unchanged Rust kernel and
  local OAuth/Gmail503; two deliberate observations, one submission/approval,
  two Needs You items. The matching regression failed for the same reason.
- After: the same operation has one item and two linked receipts; replay makes
  no second submission/approval. A separate chat's identically named call creates
  its own item and independently approved fixture submission; the first item's
  full projection is unchanged. Actual source run.sh operator-spine reports the
  two distinct chats. Draft bytes and saved arguments remain exact; zero duplicate
  tickets and no token/body in receipts. Three deliberate model calls total,
  with no automatic model continuation or effect retry.
- Forty-six focused/architecture tests across six files pass, including identity
  boundaries, ordinary-turn separation, compaction and pairing. Native TypeScript,
  strict changed-file size and all five architecture checks pass.

Private packet: `attention-resolution-20261028-F8KGDi`; retained original failure,
regression red/green, actual final replay, type/size/architecture logs and original
work baseline. The size check initially flagged oversized test-group wrappers;
the groups were split without suppressing the gate.

These are deterministic local source fixtures, not a live mailbox, installed UI,
owner approval, restart-resolution, representative attention-quality or full
TRUST-03/OP-03 acceptance. No full-suite rerun, protected source/policy change,
credential migration, main merge, release/tag, paid service or legacy removal.

## Delivery checklist correction

T03-4's written criterion explicitly requires no live send. Existing verified
agent14 candidate/installed controls, normal e467a857 selection and retained
app/CLI rollback satisfy it. That checklist row is accepted; earlier incomplete
wording confused the slice with its still-open parent. See the
[exact delivery record](agent14-cli-delivery-2026-10-28.md). T03-2 recovery and the
remaining Trust/Operator slices stay open.
