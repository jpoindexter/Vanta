# Approved composer and live recovery — 2026-10-25

## Scope and current boundary

The owner approved the first composer surface, then requested a unified design
using Meta Astryx. This source slice applies that approved treatment using the
existing Vanta theme and primitives. No Astryx dependency, reset, theme provider
or upstream shell has been installed. See UNIFIED-DESIGN-2026-10-25.md.

The separate live recovery correction keeps a failed turn's error card on its
last visible assistant segment, rather than the original stream segment before
later tool output. The latest-message recovery guard is unchanged: older
failures cannot resume a newer request. No automatic retry is introduced.

At this checkpoint the installed app remains source510e0450. New source proof
is not installed acceptance; packaging and installed replay follow separately.

## Design contract

Home and conversation share the existing 22px composer radius, three-layer
shadow, 720px maximum inline size, 12px inset and 32px controls. Home's cap is
scoped to its surface; floating/inline sizing is not globally constrained.

The existing Vanta theme owns these semantic roles in `src/styles/vanta.css`:
`--composer-surface-background`, `--composer-surface-inset`,
`--composer-label-size`, `--composer-label-leading`, `--composer-icon-size` and
the existing control/spacing/elevation roles. Footer labels use14/20; main
control glyphs18px. The conversation editor retains independent text scaling.
Dark fill uses the existing neutral card seed, not another palette.

Home uses the real shared ghost Button and project Chip. Its send action uses
a scoped slot so non-Vanta skins do not inherit global chat send styles.
Both native-disabled and aria-disabled send states remain neutral. Keyboard
editor focus marks the surface; footer buttons retain their own focus ring.
HUD outer-ring exclusion and forced-colors cues are retained. No submission,
voice, model, approval or attachment-state logic changes in the design slice.

## Executed source proof

- Parent focused composer/Home/controls/model/design guard:48cases, six files.
- Parent recovery regression/older-request guard/reused-final/interim cases:
  23cases, four files. Renderer typecheck exits0.
- Actual source Electron appearance path:22checks, two loopback model requests,
  zero renderer errors. Home/chat light and dark are captured; computed radius,
  inset, shadow, control size and720px cap match the named contract. At800px and
  native125% zoom the Home composer fits. Editor/button focus, real project-menu
  open/Escape/focus return, forced colours and real Home send are exercised.
- A project is created through the real UI/store. Only its native folder chooser
  returns a private fixture directory. This is not native-picker acceptance.
- Actual full source recovery/queue journey:all10steps pass,15scripted model
  requests, zero errors recorded across restarted windows. The formerly failing
  third Edit request action opens the saved request; editing/sending recovers it.
- Syntax, design guard, brand scan and diff checks pass. No baseline/suppression
  was changed. No full suite was run.

External evidence root:
`/Users/jasonpoindexter/Documents/GitHub/docs/Vanta-backups/composer-unification-20261025-Uu35Ad/`.
Appearance:`source-appearance-1792953050974/result.json` plus light/dark/narrow
captures. Full recovery:`source-recovery/result.json` plus captures/model ledger.
Earlier failed attempts remain retained:missing private Electron/kernel build
artifacts, a computed-outline-width assertion corrected after observing
outline-style:none, and project creation attempted after its empty-state entry
was gone. No app readiness, authority or business state was fabricated.

## Preservation and remaining gates

271of273original file hashes remain identical. Only the two approved composer
styles deliberately differ; their exact prior bytes are backed up in this
checkpoint and the earlier complete-history recovery bundle. The11unrelated
dirty tracked files and original untracked work remain untouched.

The inherited floating-surface suite still has two delayed-focus ownership
failures, reproduced identically in an untouched baseline; not fixed/suppressed.
HUD/inline geometry, full contrast/audible accessibility, owner visual acceptance,
unsent-image custody, unread/reading-position recovery and real account/hardware
proof remain open. Cold-restart failed-run metadata is a distinct projection gap;
the live card correction does not certify that path. Home attachment setup and
other DN-29 surfaces are not accepted by this bounded appearance check.

No main merge, PR reopening, release/tag, paid/CI change, protected source edit,
legacy deletion or broad card completion. Whole delivery goal remains active.
