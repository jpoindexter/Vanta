# Blocker ownership and resolution — 2026-10-28

## Result and scope

The existing legacy-ticket resolution path now clears only the intended chat's
automatically collected blocker. Repeated occurrences in that chat retain one
ticket and its comments. The registered ticket tool also derives decision scope
from the host session, not model-supplied extra fields.

**O03-3 remains incomplete.** This fixes a second real association/clearing bug;
it does not implement evidence-bound clearing of canonical unknown-effect holds.
The earlier [exact-operation deduplication](uncertain-attention-deduplication-2026-10-28.md)
and this ticket path remain distinct. No generic Done action was added to erase
an unknown action or authorize another send.

## Reproduced cause

The legacy blocker key used kind plus a shortened, normalized display title.
Two chats issuing the same research request shared one ticket. An actual agent /
registered read_file / unchanged-kernel replay produced three stopped turns:
chat A twice, chat B once. All three comments entered one ticket. The existing
source run.sh maintenance resolve command then archived it and left zero Needs
You items, incorrectly clearing chat B too. Two regression tests also reproduced
cross-chat and distinct-long-request collisions. A separate ticket-tool regression
reproduced its missing host-session binding.

## Small shared fix

- Automatically collected blockers use a host-owned source plus the full request
  as their identity, hashed with their kind. A missing source binding does not
  merge automatic outcomes. Short display titles no longer decide identity.
- The existing registered ticket needs_human handler supplies its actual session
  and full decision title. Its argument parser does not expose identity/source
  overrides to the model.
- Direct explicitly shared project tickets keep their existing identity and
  deduplication behavior. No schema, new store, tool, dependency or resolver was
  added. Old merged tickets and their original evidence are not migrated.

This identity is not a new permission boundary. Existing project-wide ticket
management can still address a known ticket ID; its authorization was not
changed. Multi-process store races and crash durability remain separate gates.

## Executed evidence

Two real source-agent / unchanged-kernel journeys passed:

1. Automatic stopped-turn collection: three deliberate model calls, one A ticket
   with two comments and an independent B ticket. Actual source CLI resolution of
   A leaves B's entire record unchanged. Actual CLI operator view reports one
   remaining Needs You item.
2. Registered ticket tool: six deterministic model calls across three manual
   turns, the same deduplication/isolation and actual CLI resolution/readback.
   The tool's host-session binding is used through ordinary agent dispatch.

Both projections keep a manually resolved ticket unverified, not a verified Done
accomplishment. No network provider, owner profile, live account or consequential
external action was used. The test operator deliberately ran the existing resolve
command; this is not evidence that only a human can resolve project tickets.

Thirty-nine focused tests across five files, native TypeScript, strict four-file
size analysis and all five architecture checks pass. Private packet:
`attention-chat-scope-20261028-pDCR04`, including original failing resolution,
red regressions, both actual agent/CLI replays and preservation baseline.

Installed agent14 and normal CLI e467a857 remain unchanged. Full O03-3, canonical
review clearing/restart/expiry, installed UI and live-account acceptance, security,
parity and human gates remain open. No full suite, protected-source/policy change,
main merge, public release/tag, paid service or legacy removal occurred.
