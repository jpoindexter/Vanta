# Cmd+K chat selection — 2026-10-24

## Criterion and observed cause

Cmd+K → type a chat title → Enter must open that chat without requiring an extra
arrow key, focus its existing draft, and never submit it. A no-match query must
not activate the old result. Both chat drafts must survive switching back.

Actual baseline: the sole Navigation Alpha result remained aria-selected=false.
Enter left the palette open; ArrowDown selected it and Enter then opened it.
The deferred row list and uncontrolled cmdk highlight could diverge after query
filtering. This is a real no-effect Enter, not a changed route expectation:
the existing picker deliberately focuses/opens workspace tabs and need not
replace the main chat's URL.

## Change

The existing highlight module owns a small controlled selection hook. Retain a
choice while it is present; otherwise select the first displayed value or none.
Rows and the selection map now use the same deferred group snapshot. Pending
results expose no selection, preventing Enter from acting on an old match.
The frame/input still paint before the deferred list. No input remount, DOM
selection hack, dependency, new search interface or changed chat-opening intent.
Existing modifier, workspace/profile, theme-preview and pointer behavior remain.

## Executed evidence

- Three focused cmdk tests: resolved highlight reporting, arrival/filter/removal,
  arrow choice retained on updates, Enter selects once, empty/pending results
  cannot execute an old action. These tests cover the selection contract; the
  baseline defect itself was reproduced in the actual app, not inferred from
  the tests.
- Exact-index source candidate: Vanta-backups/palette-selection-candidate-20261024-OaH8c1.
  Source build: 339 runtime chunks.
- Actual private-profile Electron: 10 assertions. Two real local model replies;
  both filtered chats selected without arrows; Enter restored each correct
  draft and typing focus; empty-query Enter did not activate a stale chat;
  Escape retained the last draft. Two model requests total, zero renderer errors.
  Report/screenshot: `proofs/palette-selection-2026-10-24/`.
- Size ratchet: eight inherited violations, none new/worse in touched source.
  All five architecture boundaries, brand zero, design no increase, staged
  secret and diff checks pass. Renderer typecheck still fails only on the
  inherited missing session-resume-active-turn.json fixture.

## Preservation / remaining scope

Search Clear was pushed separately as 963f284ed0e5b57ebd1690324765821ada4702ed.
Verified pre-selection backup: Vanta-backups/chat-navigation-postcommit-20261024-jLWo0p.
All 273 pre-existing changed/untracked regular files remain byte-identical;
wider design stays uncommitted. No installation, normal profile/account,
Rust/factory, policy change, merge, PR edit, tag, release or CI enabling.

This does not certify all palette commands, nested theme pages, remote/profile
switches, VoiceOver, arbitrary window layouts, installed-app behavior or the
full Codex-style redesign. DN-13/22/29 remain open. Continue remaining keyboard
and navigation work with separate evidence; do not turn this into a blanket
Done or a proof marathon.
