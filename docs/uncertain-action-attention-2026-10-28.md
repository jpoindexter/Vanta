# An actionable uncertain-action blocker — 2026-10-28

OP-03 / O03-2 source acceptance only. Installed, account and parent gates remain.

## Root cause and change

The actual agent already stopped uncertain effects without retrying and created
one canonical Needs You WorkItem. Its terminal receipt omitted the existing
`needsEffectReview` flag, so the operator projection could only display
`Execute agent.turn`, `No blocker reported by the source` and a technical ID.
Adding another ticket would have duplicated the attention item.

The terminal receipt now retains `unknown` when that typed flag is present.
The read-only projection explains a matching uncertain terminal record:

```text
Needs you: Check whether the action completed
  Why: The provider did not confirm whether the action completed.
  Next: Open the saved conversation and inspect the provider's activity. Do not retry until the result is known.
  Source: <the original work-item ID>
```

The original ID, state and receipt links remain; the receipt-file artifact is
also exposed. Ordinary work, another WorkItem's receipt, a newer known receipt
and an explicit custom outcome are not reinterpreted. CLI attention fields use
the existing terminal-control sanitizer. No action arguments or provider body
are copied into the receipt or added explanation. The journal, approvals,
provider transport, retry rules and all owner authority are unchanged.

## Executed evidence

Private packet: `outreach-attention-20261028-ZO8D1B`.

- A focused real-conversation regression and an actual Gmail fixture both fail
  before the repair on the original technical outcome text.
- Final replay: actual conversation, registered `gmail_send`, normal OAuth
  helper, real kernel and a local HTTP-503 provider fixture. One fresh fixture
  approval, one submission, one model call, no retry or model continuation.
  The agent ends blocked/needs-human with typed uncertainty, not success.
- The resulting view has exactly one canonical attention item and zero duplicate
  tickets. Exact local draft bytes and saved-session tool arguments survive;
  receipts contain neither the complete body nor fixture credentials.
- A separate actual `run.sh operator-spine` process displays the explanation,
  safe next action and original source ID. It does not rewrite the source stores.
- Four actual routine CLI cases remain quiet: greeting, question, status and a
  successful public Example Domain read. The positive stopped-run control
  still creates one attention item. All ten CLI processes exit 0.
- 44 focused/architecture tests in seven files pass, including cross-item,
  ordinary-state, newer-receipt, custom-outcome and terminal-control cases.
  Native TypeScript checking and strict size checks of both production files pass.

The first two retained OAuth fixture attempts preceded this repair and failed
with synthetic `invalid_client`; the later explicit OAuth-library transport
seam reaches only the local fixture. No owner account or credential is involved.

## Boundaries and next work

This accepts one uncertain-outreach source path, not O03-3 deduplication or
resolution, O03-4 expiry/restart, cross-channel notification quality or the full
OP-03 contract. The view is provider-neutral; provider-specific titles and a
Desktop conversation-opening interaction are not established by this CLI proof.
No live Gmail submission, owner reconnection, installed-app acceptance, broad
business usefulness, 95% actionable or under-1% duplicate claim is made.

Installed agent11 and normal bdf5780a CLI selection remain unchanged. T03-4
exact packaged delivery remains open. Next in the Operator lane is O03-3:
repeat/resolve the same bounded blocker without duplicating it or clearing
another conversation's attention. Preserve the unknown-effect hold and draft;
do not create an automatic retry or infer permission to send.
