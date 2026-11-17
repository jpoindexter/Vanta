# Find must navigate visible content — 2026-10-24

## Criterion and cause

Searching the three visible occurrences in a chat must show 1/3 and step to
visible highlights, not claim six matches by including a CSS-hidden legacy
session header. The actual prior replay recorded six marks, the first three
in that hidden header. That is why the initial steps appeared to do nothing.
See the retained baseline in FIND-NAVIGATION-2026-10-24.md.

## Change

One shared skip predicate serves initial wrapping and the unmarked-content
check used by subsequent steps. Chromium checkVisibility excludes CSS-hidden
subtrees, including inherited visibility. display:contents containers still
allow traversal to visible children. No CSS/header removal, new controls,
dependencies or backend changes. Layout-less environments without that API
retain the prior fallback; their mocks do not establish real browser behavior.

## Executed proof

- One new regression failed before the fix (six instead of three); the
  display:contents compatibility test already passed. Both now pass.
- 88 focused Find tests across four files pass, including scope/step, route
  teardown and the earlier dismissal/caret cases. Not a whole application run.
- Exact-index source candidate:
  Vanta-backups/find-visibility-candidate-20261024-voMWss. Source build: 339 chunks.
- Real isolated Electron: 18 assertions. Exactly three marks, all browser-visible;
  Enter/Shift+Enter/Cmd+G step the visible transcript; Escape and pointer Close
  return to the original draft/caret; continued typing, repeated Cmd+F,
  no-match handling and another selected control retain their behavior. Exactly
  one local scripted model request, zero renderer errors.
  Root vanta-donepath-WzWKE8; report and screenshot in
  `proofs/find-visibility-2026-10-24/`.
- Size ratchet: five inherited violations, none new/worse. All five architecture
  boundaries pass. Brand zero, design no increase, staged secret and diff checks
  pass. Renderer typecheck retains the inherited missing fixture diagnostic
  for tests/fixtures/session-resume-active-turn.json, not a green typecheck.

## Preservation and scope

Focus/caret checkpoint c32978effb74f3ebdc2c4d783989f9139a8ebeeb was pushed first.
Verified intermediate bundle, dirty patch and untracked archive:
Vanta-backups/find-focus-postcommit-20261024-YWGAKC. All 273 pre-existing dirty/
untracked regular files remain byte-identical. Wider design stays uncommitted.

No installed-app replacement, normal profile/account/credentials, Rust/factory,
merge, PR edit, tag, release or CI enabling. Full keyboard/split/nested palette,
VoiceOver, performance on huge/streaming transcripts, CSS visibility changes
during an existing search and owner visual acceptance are not certified here.
DN-13/22/29 remain open. Continue other dependency-ready navigation paths;
owner-only gates and parked proof marathons remain unchanged.
