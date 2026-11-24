# Repeated announcements and reduced-motion navigation — 2026-10-25

## Criterion and cause

Each newly completed reply must add fresh content to the existing polite log,
including identical replies after the six-line limit. History navigation must
not reannounce completed replies. With reduced motion enabled in the test
window, keyboard timeline and latest-reply jumps must have no animated
intermediate scroll positions, without sending/changing the draft.

Actual baseline vanta-donepath-FjZkof reached the fourth identical reply but
its completion paragraph was the same DOM node as before. The bounded log's
keys used list index and text; after reaching six identical lines, React reused
every child without a new live-region addition. The focused regression failed;
the three existing tests passed.

## Small repair

The existing component assigns each queued line a local monotonically
increasing identity. Allocation happens before the pure state updater. The
six-line bound, polite/non-atomic log, paragraph batching, history suppression
and text remain unchanged. No visual UI, new observer, dependency, backend
state or global counter. The existing timeline reduced-motion behavior already
worked and was not rewritten.

## Executed evidence

- Exact-index candidate: Vanta-backups/announcements-candidate-20261025-pE8fFI.
- Nine focused tests / two files pass: component and pure announcement rules.
- Actual source Electron vanta-donepath-AfH2UB: 20 checks pass with browser
  reduced-motion emulation; no Mac preference is changed. The empty polite
  log exists before replies, all four local replies add fresh completion nodes,
  and only the last six lines remain. Native Shift+Tab/Home/Enter navigates
  the timeline; Tab/Enter returns to the latest reply. Sampled scroll positions
  are 182→14 and 14→183, with no intermediate animation. Cmd+L returns to the
  unchanged draft; navigation adds no history announcement or model request.
  Four scripted loopback requests total, zero renderer errors.
- Initial verification read the live log before its effect settled; awaiting
  the actual DOM update resolved that timing assumption. Two turns did not
  create a meaningful scroll distance; four turns did. The first post-fix
  run tabbed before Scroll to bottom appeared; the final driver waits for
  that existing visible affordance before native Tab. Those diagnostics are
  retained; they were not repaired with unrelated production changes.
- Build: 339 runtime chunks. One production file meets all size limits;
  five architecture boundaries pass; brand zero and no design-debt increase.
  Staged secret/diff checks pass. No full suite or fresh renderer typecheck;
  its last inherited missing session-resume-active-turn.json error is unresolved.

## Preservation and limits

All 273 original modified/untracked regular files remain byte-identical. Verified
pre-edit recovery: find-fast-final-20261025-hNCZSH, complete branch bundle plus
dirty patch and untracked archive. Restore only into a new empty directory.
Unrelated design work remains unstaged.

Fresh DOM additions establish live-region input, not audible screen-reader
delivery. VoiceOver, installed-app, whole-app motion/contrast, live-provider,
account and owner visual acceptance remain unverified. No installation, Mac
settings/profile/account/Rust/factory change, main merge, PR edit, tag/release
or CI enabling. DN-13/22/29 remain open; broader goal ACTIVE. Next: reconcile
the remaining dependency-ready keyboard/navigation items and their owner gates,
using actual evidence rather than inventing new work or running N=20 loops.
