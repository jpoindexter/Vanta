# Find dismissal and draft continuity — 2026-10-24

## Criterion / observed cause

Cmd+F from an unsent draft → search/step → Escape or Close must return to that
same editor and typing position, without sending, navigating, or stealing a
different control the user selected while Find was open.

Actual source baseline acd30c4: Enter/Shift+Enter/Cmd+G stepped matches, but
Escape left document.activeElement on BODY. Returning only focus then failed
the actual continued-typing check: rich-editor selection also needs restoring.
Two new dismissal tests failed before the fix; two non-steal tests passed.

## Minimal change

The existing FindBar remembers its opener and an editor-owned DOM range on the
first open. Explicit dismissal restores them only when Find/body still has
focus, the opener is connected and its keep-alive pane is not hidden. Repeated
Cmd+F keeps the first origin. Route/profile teardown retains plain close and
does not restore old focus. No new controls, copy, dependency or global state.

## Executed

- Exact-index candidate: Vanta-backups/find-navigation-candidate-20261024-4wvKeP.
  Source build produced 339 runtime chunks.
- Five new focused tests cover Escape/Close, repeated open, caret preservation,
  another selected control and a hidden keep-alive draft. Existing 55 Find tests
  retained. These are component/source checks, not native accessibility proof.
- Actual isolated source Electron: 17 assertions. Cmd+F focus; transcript
  matches; Enter/Shift+Enter/Cmd+G; Escape → original draft; subsequent text at
  the original caret; route unchanged; repeated Cmd+F selects query; no-match
  Enter stays in Find; pointer Close restores draft; another control keeps
  focus; one local scripted model request total; zero renderer errors.
  Acceptance root: vanta-donepath-zxmZCr. Reports/screenshots in
  `proofs/find-navigation-2026-10-24/` include baseline and acceptance.
- Size ratchet, five architecture boundaries, brand scan, design no-increase,
  staged secret scan and diff checks pass. Renderer typecheck retains only the
  inherited missing tests/fixtures/session-resume-active-turn.json diagnostic.

## Preservation and remaining gap

Pre-edit bundle/dirty patch/untracked archive verified outside Git:
Vanta-backups/find-navigation-20261024-yyOERw. All 273 pre-existing dirty and
untracked regular files byte-identical; wider design remains uncommitted.
No installed app, normal profile, credentials, provider/account actions,
Rust/factory changes, merge, PR edit, tag, release or Actions enabling.

The actual replay also found six matches for three visible occurrences:
three matches were in a hidden legacy session header. This is a separate
search-walker defect, not certified by the focus fix, and is the next slice.
Follow-up: FIND-VISIBILITY-2026-10-24.md records the separately executed fix.
Installed app, VoiceOver, all split/nested navigation and complete Codex-style
redesign are not certified. DN-13/22/29 remain open.
