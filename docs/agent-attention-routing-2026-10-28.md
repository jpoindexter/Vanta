# Routine automation and genuine attention — 2026-10-28

Source acceptance for OP-03 slice O03-1, not installed acceptance or parent completion.

## Observed behavior and repair

The actual CLI already completed a greeting, an ordinary question, a status
command and one successful public web read without creating a Needs You ticket
or requesting a permission decision. A positive control stopped a real agent
turn at its iteration limit: maintenance recorded one labeled blocker, but the
operator view reported zero Needs You items. Its legacy ticket adapter ignored
the existing `needs-human` label.

The shared read-only adapter now projects active labeled tickets as `needs human`.
It displays the latest structured blocker reason and next action, ignoring later
ordinary comments. A labeled ticket without that comment retains its title and
the existing review-ticket action. Done/closed tickets leave Needs You; ordinary
tickets keep their original lifecycle. Reading the view does not rewrite tickets.
No approval, grant, notification, quota, kernel or autonomy policy changed.

## Executed proof

Private receipt packet: `agent-attention-20261028-pzUjHO`.

- Before: independent source pin `121ad43b`; four routine cases produce zero
  human tickets. A recorded positive blocker remains incorrectly captured.
- After: actual current source `run.sh`, isolated project/home, real kernel,
  registered `web_fetch` and post-turn collector; all ten CLI processes exit 0.
  Four routine cases still create zero attention items; the positive control
  records one ticket and a separate CLI process projects exactly one Needs You.
- The public fetch retrieved the actual Example Domain content over the network.
  Three ordinary model turns have persisted `done` ledger entries. The model
  itself is a deterministic local fixture, not evidence of research quality.
- Nine new lifecycle/fallback regressions reproduce three failures before the
  change and all pass after it. Together with existing spine/collector tests:
  20 passed. Seven architecture checks, native TypeScript checking and strict
  size analysis of the changed production file also pass.
- Original dirty work, pending voice files, owner-state hashes, installed app
  and normal CLI selection are checked separately before publication.

Focused repeat:

```sh
cd vanta-ts
node node_modules/vitest/vitest.mjs run src/work-items/operator-spine-attention.test.ts src/work-items/operator-spine.test.ts src/operator/needs-human.test.ts src/architecture.test.ts --reporter=dot
node node_modules/@typescript/native/bin/tsc --noEmit
```

## Limits and next slice

Installed agent11 and the normal bdf5780a CLI have not received this repair.
No Desktop attention UI, live account, email submission, business-research
quality, standing external authority or representative notification denominator
was tested. One positive-control blocker does not prove the parent card's
95% actionable / under-1% duplicate thresholds, expiry or cross-channel behavior.

Next is O03-2: replay one blocked Gmail account-change or unknown-delivery
fixture through the real agent, preserve the draft and expose the smallest safe
resolution. Do not reconnect Gmail, send mail, weaken approval gates or retry an
uncertain effect to make that fixture succeed. T03-4 exact packaged delivery
remains open; the existing live Gmail credential returned `invalid_grant` in the
separate owner-authorized read-only check.
