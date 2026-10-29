# Delegated outreach boundary — 2026-10-29

## Result

T03-5 has bounded SOURCE acceptance for confirmed, per-effect outreach. Seven
actual parent conversation → registered `delegate` → worker conversation →
registered Gmail → unchanged local Rust kernel journeys pass at source
`6448e336bf12f950c1bda919dd91eff49d364b2c`.

No production defect was reproduced in this slice, so no runtime permission
code was changed. The existing worker conversation, effect gateway and fresh
Gmail approval/account revalidation already enforce the tested boundary.

## Executed cases

Every case first consumes one exact parent Gmail approval and submits one
synthetic parent message. The worker deliberately uses the same provider
tool-call ID as the parent; that does not transfer the parent's decision.
Each worker requires a second fresh outbound decision showing its own sender,
recipient, subject and complete body.

| Child attempt | Child submissions observed |
| --- | ---: |
| Reuse the parent's exact action; deny the child's fresh decision | 0 |
| Change recipient; deny the new exact preview | 0 |
| Change content; deny the new exact preview | 0 |
| Change account before child preflight; deny its new sender preview | 0 |
| Replace account while approving the child | 0 |
| Freshly approve the unchanged child action | 1 |
| Replay that consumed child operation in the same worker | 1 total; 0 additional |

Seven parents plus the two fresh-child positive controls make nine local
provider submissions in total. The replay makes no third outbound approval
request. Sidechains retain the actual child results; denied cases are typed
denied, and the replay reports the prior confirmed result without repeating it.
Action receipts omit the complete message bodies and fixture credentials.

The first harness invocation incorrectly required an explicit `stream:false`;
the real SDK omits that value for nonstreaming completions. Its failure is
retained. Correcting the fixture expectation, not production code, enabled the
seven real journeys. The initial result is not evidence of an approval escape.

Private evidence packet: `delegated-scope-20261029-SpHQBH`;
final summary: `summary-1793263136088.json`, with per-case results, sidechains,
request counts, approval previews and receipt digests.
The two existing focused delegate/effect-gateway test files also pass: 25 tests.
No full suite or typecheck was rerun for this evidence-only documentation change.

## Limits and next work

This proves an R3 worker cannot silently borrow its parent's approval. A new
explicit approval may authorize a changed preview; that is new authority, not a
scope escape. It does not create transferable unattended grants or prove R4/R5
capabilities, recurring quota/expiry/revocation, every worker host, live Gmail,
owner-operated approval UI, installed-app delegation or full TRUST-03 acceptance.

The normal CLI remains `e467a857`; installed agent15, its rollback, pending
voice changes and original work/data are unchanged. No rebuild or notarization
is needed for this evidence-only checkpoint. T03-6 recurring authority is next;
O03-3 canonical unknown-effect review clearing remains open. No new WIP, main
merge, release/tag, paid service/CI, protected-source change or live outreach.
