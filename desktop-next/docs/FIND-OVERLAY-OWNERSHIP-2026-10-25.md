# Find: one Escape, one layer; stable query scope — 2026-10-25

## Criteria / observed causes

With Find open, dismissing a foreground navigation menu or Cmd+K must close
that layer only, retaining Find and query. A later Escape closes Find without
sending or changing drafts. Editing the query after sidebar/menu interaction
must keep searching the captured chat, not jump to the first visible chat.

Actual baseline root vanta-donepath-myL0XS: Escape closed Find instead of just
the navigation menu. The Find window-capture handler consumed Escape before
the focused overlay could handle it. Three new menu/dialog/list regressions
failed; six existing focus cases passed.

After that fix, a further actual check (vanta-donepath-XjCc0R) exposed query
edits after sidebar use resolving the first chat. One focused regression also
failed. The previous live-pane repair re-resolved scope on every query; the
sidebar's active group has no chat and fell through to DOM order.

## Small shared corrections

Find's key handler respects defaultPrevented and the existing OVERLAY_SURFACE
predicate for Escape from focused overlays. No new layer framework. Explicit
pane intent now re-captures through captureFindScope, which first releases old
marks/observer. An ordinary query read keeps its visible captured scope; the
existing hidden-tab fallback still re-targets. Repeating Cmd+F from another pane
captures it; repeating within Find preserves it. No menu item was activated and
no permission/approval mode changed.

## Executed evidence

- Exact-index source candidate: Vanta-backups/find-overlay-candidate-20261025-9fqnz0.
  Source build: 339 runtime chunks.
- 96 focused Find tests / five files pass. Menu/dialog/list Escape ownership,
  continued query editing after pane adoption, older route/visibility/caret
  behavior covered. Native dialog acceptance below is specifically Cmd+K,
  not every dialog in the application.
- Actual private source Electron root vanta-donepath-2RUkS2: 27 assertions,
  including all earlier pane-switch/draft/hover/transcript paths, menu-first
  Escape, continued query typing retaining Alpha's root, second Escape,
  Cmd+K-first Escape and subsequent Find dismissal. Two scripted local model
  requests total, zero renderer errors. Report/screenshots and baseline states:
  `proofs/find-overlay-ownership-2026-10-25/`.
- Size: eight inherited violations, none new/worse. Five architecture boundaries,
  brand zero, design no increase, staged secret/diff checks pass. Renderer
  typecheck retains only the inherited missing session-resume-active-turn.json
  fixture; do not describe that gate as green.

## Preservation / ongoing execution

39e00185 was pushed as the preceding pane-switch checkpoint. External verified
backup find-switch-postcommit-20261025-xGYvvL retains that branch plus dirty/
untracked work, including the following diagnostic edits. Original pre-edit
backup find-pane-switch-20261025-AOmv9n remains intact. All 273 original regular
files byte-identical. No install/account/profile/Rust/factory/merge/PR edit/tag/
release/CI enabling. Wider design and owner review remain open.

Broader goal stays active. DN-13/22/29 are not complete; source keyboard proof
is supporting evidence, not installed/VoiceOver/whole-redesign acceptance.
Next queue: sidebar search/history keyboard round-trip, then dependency-ready
accessibility/navigation items; owner-only and parked gates unchanged.
