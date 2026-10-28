# ACP permission cancellation — 2026-10-28

**Source-runtime evidence, not a new installed delivery.** This follows the
[foreground Stop checkpoint](foreground-stop-checkpoint-2026-10-28.md).
Installed agent4 and the normal CLI still select `7d32e58f`.

## Cause and bounded change

ACP permission correlation waited only for a client response or transport close.
Cancel aborted the turn but left its pending permission promise unresolved.
A late session-wide allow could also arm the edit grant after cancellation.

Bind foreground permission waits to their prompt-local cancellation signal.
On cancellation, remove that request and its listener and resolve it denied.
Normal response, transport close and send failure clean up the same request.
Recheck cancellation before using an existing grant or recording a new one.
Unmatched stale replies are ignored by the existing dispatcher.

The existing internal approval detail carries the executing tool's lifetime;
explicitly detached delegation uses a null lifetime rather than inheriting the
originating prompt. This metadata is not emitted in ACP requests. It changes no
kernel policy, approval option, access mode, remembered rule or fresh authority.

## Executed proof

- Three initial regressions fail before the repair: unanswered approval hangs,
  canceling one session leaves its prompt waiting, and a late allow arms a grant.
- Final focused run: **104 tests across 12 files**, including approval freshness,
  session grants, independent sessions, post-Cancel requests, detached approval,
  transport close/send failure, foreground Stop, real child conversations,
  remembered rules, permission formatting and five architecture checks.
- Runtime typecheck and strict size checks for all four production files pass.
- Actual source CLI ACP → foreground delegate → loopback provider → real
  write_file → unchanged Rust kernel: Cancel settles in **228 ms without any
  permission reply**. Existing `ORIGINAL PRIVATE BYTES` remain unchanged. Exactly
  two provider requests occur; no retry or follow-up occurs. Only after the
  canceled outcome does the fixture send the stale offered allow_once.
  CLI exits naturally at EOF with code 0; the fixture-owned kernel is stopped.

Private evidence is outside Git: `docs/Vanta-backups/acp-approval-cancel-20261028-uq3Kct`
and `docs/Vanta-backups/delegate-cancel-20261028-y5Y0Ls/run-USXENq/result.json`.
Source hashes are checked before and after the actual replay. The earlier
`run-53rlY4` is a separate 172 ms intermediate-source replay, not substituted for
the final-byte run above.

## What this does not establish

The provider and human choices are scripted; no owner account or paid model is
used. Detached approval has source conversation/transport checks, not a complete
native background workflow. Cancel is not rollback of an already observed effect.
Sibling-on-failure cancellation, other direct spawn adapters, external effects,
review-clear, full Desktop parity and human acceptance remain open.

No new app package, notarization, installation or CLI cutover occurs here.
Disk headroom is insufficient for new large packaging work; original work,
owner data, installed app, CLI selection and rollback remain preserved. Roadmap
and Trello evidence are updated without closing either Building card or changing
its Done contract. No main merge, release/tag, CI or paid service is authorized.
