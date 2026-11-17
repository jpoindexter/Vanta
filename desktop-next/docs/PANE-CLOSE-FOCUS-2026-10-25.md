# Keep keyboard focus after closing a pane — 2026-10-25

## Criterion and cause

Closing a focused document must leave focus on a visible useful control,
without editing the chat draft, changing the document or sending a message.
A short backward/forward Tab round-trip must remain usable.

Baseline source Electron vanta-donepath-Se6RfI used a real document click,
Shift+Tab to Edit and Cmd+W. The pane closed, but focus remained on body even
after 1.5 seconds. Three focused regressions failed; three non-steal/veto
guards already passed. Close updated pane ownership but had no focus handoff.

## Small shared repair

Both closeTreePane and closeToolPane schedule the same one-frame handoff.
It acts only for the focused closing zone or its active close-menu intent.
It preserves a surviving focused control or a newer focus choice, skips hidden
and inert panes, prefers a surviving control in the same zone, then a visible
chat composer, then shell controls. Existing closer/plugin validation stays
in place. No new chrome, dependency, global observer or backend action.

## Executed evidence

- Exact-index candidate: Vanta-backups/pane-close-candidate-20261025-u0SXBi.
- 32 focused tests / four files pass: new focus handoff, focused session tab,
  tool-pane toggle and plugin close. Added hidden/inert, Find and menu guards.
- Actual source Electron vanta-donepath-i7KGjk: 15 checks pass. Native
  Shift+Tab reaches document Edit; Cmd+W closes it and focuses the composer.
  Five Shift+Tabs plus five Tabs return to that composer. Reopen, hover the
  tab to reveal its existing Close button, pointer-close: visible focus again.
  Exact draft and file bytes retained; one scripted local model request,
  no accidental send and zero renderer errors.
- An initial post-fix replay passed close-focus but raced Cmd+L's deferred
  focus before the Tab round-trip. The driver now waits two animation frames
  for that existing handoff; no production timing change. Another diagnostic
  tried clicking the hover-only Close button before hovering its tab; explicit
  tab hover made the real pointer path reachable. Reports retain both gaps.
- Build: 339 runtime chunks. Size: two production files, 12 inherited
  violations, none new/worse. Five architecture boundaries, brand zero,
  design debt unchanged, staged secret/diff checks pass. Typecheck is NOT
  green: inherited missing session-resume-active-turn.json fixture only.

## Preservation and limits

All 273 pre-existing modified/untracked regular files remain byte-identical.
Recovery checkpoint preview-find-final-20261025-DL6Kk2 was verified before
editing; it retains the branch bundle, original dirty patch and untracked
archive. Wider design work remains unstaged. Restore only into a new directory.

This proves source Electron document close, not every asynchronous plugin
close, embedded browser/PDF guest, installed app or VoiceOver. A closer that
keeps its control visible is left alone; this does not certify eventual async
unmounts. No install/profile/account/Rust/factory/main merge/PR edit/tag/release
or CI enabling. DN-13/22/29 remain open. Broader goal ACTIVE; next inspect
focus-visible feedback and the remaining dependency-ready keyboard cards.
