# Chat history keyboard handoff — 2026-10-25

## Criterion and cause

Cmd+Shift+F reaches history search. With matching results, unmodified Arrow
Down reaches a rendered chat title without opening/sending; native Enter opens
it. Repeating Cmd+Shift+F selects the retained query for replacement. Chat
round-trips retain separate drafts. Escape while Find is open dismisses Find
without clearing history search or submitting a draft.

Actual baseline vanta-donepath-iBj7IS reproduced Arrow Down remaining in the
input. The sidebar supplied neither a search key handler nor query selection
on its existing focus event. Two new integration assertions failed before the
change. The other five new guard cases already passed.

## Small correction

Feature-local useSearchKeyboard retains the existing focus event and adds
selection plus Arrow Down handoff to a real row button in the same sidebar's
current results. Enter uses that button's existing native action; no duplicate
session-open implementation. Modified keys, composition, empty queries and
empty results stay in the input. Browser focus handles scrolling. No new
strings, controls, global state, dependencies or permission changes.

## Executed evidence

- Exact-index candidate: Vanta-backups/sidebar-history-candidate-20261025-fhPWve.
  Source build: 339 runtime chunks. Original unfinished design hunks excluded.
- Seven targeted sidebar integration tests passed; 16 related SearchField,
  sidebar focus and search-order tests passed. A broader file run exposed four
  inherited stale Sessions/No sessions copy expectations, present before this
  change; that file is not wholly green. No suppression or baseline update.
- Actual private source Electron vanta-donepath-bEXLmX: 11 checks passed, two
  scripted loopback model requests and zero renderer errors. Search → Arrow
  Down → Enter restores Bravo's draft; Cmd+L and native End allow continued
  typing there; repeated search replaces the query and returns to Alpha's
  unchanged draft. Find Escape retains history search and the selected draft.
  Report, screenshot and baseline: proofs/sidebar-history-keyboard-2026-10-25/.
- An initial 10-second resume wait timed out under concurrent checks. A replay
  using the existing 30-second resume budget completed; this is not a claim
  that chat resume latency or every loading state has been repaired.
- Size: two staged source files, five inherited violations, none new/worse.
  Five architecture boundaries, zero brand matches, no increased design debt,
  staged secret scan and diff check passed. Renderer typecheck still fails
  only for the inherited missing session-resume-active-turn.json fixture.

## Preservation and remaining work

External pre-edit backup sidebar-history-20261025-lTLEzB contains a verified
complete branch bundle, all original dirty changes and untracked archive.
272 of 273 original regular files remain byte-identical; the overlapping
sidebar file retains every original design hunk verbatim, apart from line
offsets, with only the scoped keyboard patch staged. No existing work removed.

DN-13/22/29 remain open. This is supporting source keyboard evidence, not
installed-app, VoiceOver, virtualized/large-result ranking, full keyboard walk,
full redesign or release acceptance. The shortcut enters a currently rendered
matching row; full arrow-key traversal of arbitrarily large virtualized lists
is not added or certified. No install/account/profile/Rust/factory/main merge/
tag/release/CI enabling. Next: collapsed-sidebar search handoff and remaining
dependency-ready tab/preview navigation. Broader goal remains ACTIVE.
