# Keyboard history search from the agent roster — 2026-10-25

## Criterion and reproduced cause

Cmd+Shift+F must reveal the Chats pane and focus its retained query even when
the agent roster owns that sidebar tab. It must work after sidebar collapse,
without replacing the current chat, its draft, workspace owner or other panes.

Actual baseline vanta-donepath-lMynZV failed: the shortcut left Search chats
inside a hidden pane. Opening the side did not activate the Sessions tab;
focusing the hidden input failed and focus returned to the composer. Two new
store regressions failed for normal and mirrored layouts; an already-visible
history case passed.

## Correction

requestSessionSearchFocus now uses existing revealTreePane('sessions') after
opening the side, before the existing deferred focus event. One import and
one call; no replacement navigation mechanism. Ordinary sidebar toggles still
preserve their tab choice. No new strings, controls, dependency, workspace
scope change or agent-session action.

## Executed evidence

- Exact-index candidate: Vanta-backups/roster-search-candidate-20261025-mcGn9B.
  Source build: 339 runtime chunks. No original unfinished work included.
- Twelve focused tests / four files passed: history reveal before focus,
  mirrored layout, minimized/hidden panes, idempotence, retained workspace
  owner, unrelated pane preservation and existing sidebar focus/collapse.
- Actual isolated source Electron vanta-donepath-FxIwhO: 16 checks passed,
  including roster-to-history focus both expanded and collapsed, retained
  query, matching-row keyboard handoff and original draft. One scripted
  loopback model request, zero renderer errors, no accidental send.
- Actual isolated source Electron vanta-donepath-Z35sR6: eight existing tab
  navigation checks passed on the candidate. Ctrl+Shift+Tab with Find open
  retains query, highlights the visible chat, preserves both drafts and never
  restores focus to the hidden tab. Two loopback requests, zero errors. This
  tab flow also passed before the fix; no tab behavior was rewritten.
- Reports/screenshots and baseline: proofs/roster-search-keyboard-2026-10-25/.
  Drivers use scoped tab-list selectors so hidden roster text cannot create
  false selector failures on a second visit.
- Size: one staged production file, three inherited violations, none new or
  worse. Five architecture boundaries pass; brand zero, design debt unchanged,
  staged secret and diff checks pass. Renderer typecheck still fails only for
  the inherited missing session-resume-active-turn.json fixture. The four
  previously recorded stale-copy assertions were not changed or re-certified.

## Preservation and next

All 273 original dirty/untracked regular files remain byte-identical. The
external pre-edit backup collapsed-search-20261025-iA23Mc retains a verified
complete branch bundle plus dirty patch and untracked archive. Original design
work remains unstaged. No install, account/profile, Rust/factory, main merge,
PR edit, tag, release or CI enabling. No full-suite or flake marathon.

DN-13/22/29 stay open: supporting source keyboard evidence does not certify
installed/VoiceOver/entire redesign/release acceptance. Broader goal ACTIVE.
Next: document-preview Find ownership, then dependency-ready navigation and
accessibility gaps. Owner-only and parked gates remain unchanged.
