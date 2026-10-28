# Gmail uncertain-result recovery — source acceptance, 2026-10-28

## Accepted boundary

TRUST-03 T03-2 has bounded SOURCE acceptance at runtime source `bc4aa75b`.
This is not installed-app, live-account, human-review or whole-parent acceptance.
No new production code was needed after the cross-host queue repair.

## Actual journey

Three independent private fixture cases exercise HTTP 503, connection reset
after consuming the request, and HTTP 200 without a message acknowledgment ID.
Each uses the real registered Gmail tool, unchanged Rust kernel, normal custom
OpenAI-compatible provider over local HTTP/SSE, Desktop router and real approval
endpoint. No live Google account or external model is used.

For each case:

1. Save an exact unsent composer draft and queue one follower plus an independent
   chat's question. Submit the fixture request after one fresh Allow-once decision.
2. Observe blocked/needs-review, one consumed Gmail submission and a saved typed
   unknown result. The follower is retained, not executed.
3. Exit the initial host process with code 0. Start a distinct host PID against
   the same private project/home. Reopen the saved chat through the actual
   `/api/sessions/open` route, including normal saved-provider reconstruction.
4. Read back the exact composer draft and original tool arguments. Queue resume
   returns 409 before a model call. A manual inspection question remains usable.
5. Return the same consumed tool operation from the scripted model. It stays
   blocked/unknown, requests no new approval and makes no second Gmail submission.
6. Complete the independent chat's queued question without changing the held
   follower. Retain one canonical attention item, its receipt timeline, original
   receipt artifact and the explicit “Do not retry” instruction.

The saved and returned recovery actions are exactly `edit_request`, not Replay
or Retry. Editing/inspection is not a review-clear operation or renewed authority.

## Executed evidence

Private packet: `gmail-cold-recovery-20261028-UNkxc3`.
Final summary: `summary-1793224045210.json`; all three cases pass.
The six host PIDs are distinct initial/restart pairs. Each initial host is
observed terminal before its restart is launched. All owned hosts and kernels
are stopped afterward.

Across the three final cases: three Gmail fixture submissions, three fresh
fixture approvals, zero replay submissions and zero recovery approval prompts.
Every case retains the exact draft before and after the recovery journey,
original saved arguments, held queue and one actionable canonical blocker.
Action receipts exclude the body and synthetic credentials.

The initial harness attempt correctly held the queue but could not measure the
manual model call: session opening rebuilt the real provider rather than keeping
the injected in-memory fixture. That failure is retained. The corrected harness
uses local model HTTP/SSE for both lifetimes and does not bypass saved-provider
reconstruction. A second pass added explicit saved/returned recovery-action and
final draft readback assertions; the final evidence above includes those checks.

## Still open

Canonical evidence-bound review/clearing, expiry, full TRUST-03 authority binding,
installed-host process recovery, live-account behavior, abrupt crash/power-loss
durability and business/human acceptance remain unproven. This journey tests a
normal host exit/restart, not an arbitrary interrupted write.

Installed agent14 and normal CLI e467a857 remain unchanged. No user credentials,
approvals or original work were migrated. Parent cards remain Building. No main
merge, public release/tag, paid service or security-clean claim.
