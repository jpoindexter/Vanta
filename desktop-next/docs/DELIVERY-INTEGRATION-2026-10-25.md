# Existing Desktop candidate integration — 2026-10-25

## Remaining gap first

This is source acceptance, not installed-app delivery or owner visual approval.
Follow-on delivery: [exact installed build](INSTALLED-DELIVERY-2026-10-25.md)
records the subsequent signed/notarized installation and packaged-path proof.
The broader delivery, security and modularization goal remains active. DN-29
and Desktop cutover remain open. No legacy capability was removed.

## Integrated scope

The preserved sidebar, composer, titlebar, transcript, navigation, status and
project-entry changes are now one exact-index candidate. Supporting routes use
one Tools & connections disclosure; routine status diagnostics use Details.
Existing route actions, permission controls, context menus, focus rings and
direct Files/Browser/Terminal/Review access remain. Composer elevation and the
sidebar edge shadow use scoped semantic tokens; no dependency was added.

Four stale English assertions were aligned with the already-committed Chats
copy. The approval proof now uses the actual Always label. The cross-project
proof enters Settings through More, matching the preserved titlebar redesign.
These are test-caller corrections, not permission-policy changes. Historical
proof scripts outside this run are not recertified or bulk-edited.

## Executed checks

- 102 distinct affected tests across 14 files pass. Initial run: 98 passed,
  four stale sidebar-copy assertions failed; that 18-test file then passed.
  Do not add overlapping rerun counts.
- Renderer `tsc --noEmit`: exit 0. Source build: 339 runtime chunks.
- Navigation/status journey: 24 checks, zero renderer errors.
- Titlebar/transcript journey: 26 checks, zero renderer errors. Real sandbox
  shell tool, transcript copy, expanded/collapsed activity, approval Reject,
  keyboard menus, 800px layout and stored dark preference were exercised.
- Sidebar/composer journey: 22 checks, zero renderer errors. F-115/F-116/F-118
  exercised. Only the final OS picker is stubbed; actual handlers attach the
  image, send it to the local model and clear the chip after the reply.
- Five architecture boundaries, design scan and brand scan pass.
- Staged size ratchet: 13 source files, no new/worse findings; 25 inherited.
  This does not imply the whole renderer is modularized or debt-free.
- Candidate renderer secret scan: no leaks. All 273 original changed/untracked
  regular files match their pre-integration SHA-256 values.

Source restart acceptance exits 0: all 13 steps and seven probes pass. The saved
Always rule survives cold restart in the same project, a different project
still asks, Plan refuses writes before/after restart, irreversible actions
require fresh approval, and large/image paste plus three viewport sizes pass.
Post-paste keystrokes peaked at 94ms (200KB text) and 20ms (image). One browser
warning blocks navigator.vibrate without user activation; no runtime exception
is reported. Permission-query results do not prove microphone hardware access.
Its first run stopped only on the obsolete titlebar Settings selector; both
reports are retained. No policy was loosened to pass the rerun.

Raw reports and selected screenshots: [proofs/delivery-2026-10-25](proofs/delivery-2026-10-25).
The screenshots use an isolated profile and scripted loopback model. They do
not show an owner account, provider quality, native OS picker or business run.

## Recovery and next action

The verified pre-edit bundle, original binary dirty patch and 237-file untracked
archive remain in `Vanta-backups/keyboard-goal-accepted-20261025-cMRwre` outside
the public repo. Source candidate: `Vanta-backups/delivery-candidate-20261025-pNXJV7`.

The existing restart criterion subsequently passed; source checkpoint f5b12a97
was pushed, backed up, signed/notarized and installed without interrupting work.
The exact installed-path criterion also passed; see the follow-on delivery
record for evidence. Next: dependency/security and remaining trust batches.
No main merge, PR reopening, public release/tag or paid/CI
workflow is authorized here. Owner visual/parity and deferred human/live-account
acceptance remain separate.
