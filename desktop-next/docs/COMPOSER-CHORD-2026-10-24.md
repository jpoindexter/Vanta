# Cmd+L ownership — 2026-10-24

## Done criterion

In the actual isolated Electron app, Cmd+L moves from a keyboard-focused control
with a real passive tooltip to the existing composer; typing is visible and
unsent. An actual open permission menu retains its focused control instead.
After Escape, Cmd+L returns to the composer without losing the draft or sending.

## Cause and smallest fix

The shared OVERLAY_SURFACE selector treated every Radix popper wrapper as an
interactive layer, including tooltips. Baseline 2b06f8e9: actual Dictate button
focus and its tooltip remained after Cmd+L and a bounded two-second focus wait.
This was not a missing shortcut binding. The same selector guards both composer
keyboard focus and floating-composer focus-follow; these are its only callers.

Exclude wrappers containing role=tooltip. Dialogs, alertdialogs, menus, listboxes,
bare poppers and explicit overlay surfaces still block. No tooltip lifecycle
rewrite, focus handler fork, new listener/control, permission or terminal change.
This applies WCAG keyboard ownership and modeless shortcut behavior without
adding visible chrome or a technical recovery instruction.

## Executed evidence

- Two new regressions failed before changing the selector (shared predicate and
  real focus request bus). Afterward: 30 tests / 5 files passed, including
  terminal/dialog/full-page gates, floating-layer, editable and selection guards.
- Exact-index candidate: Vanta-backups/composer-chord-candidate-20261024-ew9oU9.
  Source build: 339 runtime chunks. Actual Electron: 11 checks, one local model
  request, real tooltip and permission menu, exact unsent-draft retention, zero
  renderer errors. Report and screenshots: `proofs/composer-chord-2026-10-24/`.
- The first post-fix replay passed the tooltip/focus/typing path, then stopped on
  a proof selector missing the button's "Permission mode:" accessible-name
  prefix. Correcting that selector enabled the actual menu check; production
  code was not changed again or loosened to pass it.
- Size ratchet: three inherited violations, none new/worse. All five architecture
  boundaries, brand zero, design no increase, staged secret and diff checks pass.
- Renderer types still fail only on the inherited missing
  `tests/fixtures/session-resume-active-turn.json`; not a passing-typecheck claim.

## Publication and preservation

Prompt order was separately verified and pushed first as
2b06f8e9fc1b23c906e9accde09ec2aa85d6df35, with remote SHA read back equal.
Pre-Cmd+L verified source backup: prompt-order-postcommit-20261024-6Ajm6Z under
Vanta-backups (full-history bundle, dirty binary patch, untracked archive).
All 273 pre-existing changed/untracked regular files remain byte-identical.

No installed app/normal profile, account, paid model, Rust/factory, main merge,
PR edit, tag or release. GitHub Actions remains disabled. No full keyboard walk,
VoiceOver, arbitrary multi-window ordering or complete Codex-style redesign
acceptance. DN-13/22/29 stay open; wider design is preserved and uncommitted.
Next: remaining dependency-ready keyboard/navigation work, one cause at a time;
owner-gated cards and parked research/proof marathons remain parked.
