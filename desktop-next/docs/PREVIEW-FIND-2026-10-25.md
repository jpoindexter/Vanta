# Find follows the selected rendered document — 2026-10-25

## Criteria / causes

Cmd+F after selecting a rendered Markdown document must search that document,
not a neighboring chat. While Find remains open, explicit pane navigation
carries its query and clears the old highlights. Hover alone must not move the
search or the caret. The chat draft and document on disk must remain unchanged.

Actual baseline vanta-donepath-vt6gf7: clicking the real brief.md preview then
searching Local brief returned no matches in the chat root. The resolver and
pane-intent listener recognized chat surfaces only. Two new regressions failed;
the hidden-document guard case already passed.

After extending the existing selector, actual vanta-donepath-djSSXW correctly
searched the document and switched panes, but hovering the chat moved Find back
there. The floating-composer pointermove handler auto-focused its editor when
the selected document left no editable control focused. A separate failing
regression established that cause before the guard was added.

## Corrections

- One shared selector includes the existing data-preview-markdown read-only
  surface. Resolver and pane-intent hook reuse it; no new preview wrapper.
- Floating-composer hover handoff stands down while Find is active. Explicit
  clicks still work; ordinary hover focus resumes after Find closes.
- Existing query lifetime, hidden-tab exclusion, visible-content walker,
  menu Escape ownership and draft/caret behavior remain in the same pipeline.
  No replacement search UI, dependency, provider call or file-write path.

## Executed evidence

- Exact-index candidate: Vanta-backups/preview-find-candidate-20261025-fRqMZV.
  Source build: 339 runtime chunks. Production changes touch three shared files.
- 100 focused tests / six files passed: Find scope/bar/focus, editable-field,
  floating-layer and text-selection guards. Three new regressions failed at
  their respective baselines. No test suppression or baseline update.
- Actual isolated source Electron vanta-donepath-1bEs48: 11 checks passed.
  The real local Markdown file is opened from Files and searched; an open
  query follows chat → document, old marks clear, hover does not re-home it,
  repeated Cmd+F replaces the query within the document. Escape preserves
  the unsent draft. Exact file bytes remain unchanged. One scripted loopback
  model request, no accidental send, zero renderer errors.
- Reports, highlight/dismissal screenshots and both baseline failures:
  proofs/preview-find-2026-10-25/. The existing sidebar/tab proof is separately
  recorded in ROSTER-SEARCH-KEYBOARD-2026-10-25.md, not re-certified here.
- Size: three staged production files; eight inherited violations, none new
  or worse. Five architecture boundaries pass; zero brand matches, design
  debt unchanged, staged secret/diff checks pass. Renderer typecheck still
  fails only for the inherited missing session-resume-active-turn.json fixture.

## Preservation / remaining scope

All 273 pre-existing dirty/untracked regular files remain byte-identical.
The verified f67a7e42 recovery checkpoint in roster-search-final-20261025-yrbTyF
preserves the full branch, original dirty patch and untracked archive; the
initial preview diagnostic is retained alongside it. Wider design work stays
unstaged. No install/account/profile/Rust/factory/main merge/PR edit/tag/release/
CI enabling. No full-suite or flake marathon.

This covers rendered Markdown, not source editors, virtualized source/diff,
PDFs, browser guests, installed-app or VoiceOver acceptance. No DOM marks are
injected into those unsupported surfaces. DN-13/22/29 remain open; broader goal
ACTIVE. Next: remaining Shift+Tab and pane-dismissal focus behavior. Owner-only
and parked gates remain unchanged.
