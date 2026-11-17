# Shell-first Desktop delivery — 2026-10-25

## Exact installed candidate

Source `536e17fbc451109cbe175994da5a7d7088308d29`, local version
`0.1.0-local.20261025.shell`, built `2026-10-25T16:32:34.047Z`.
The integration branch contains this source; no main merge or public release.

`/Applications/Vanta.app` was replaced only while stopped, through the existing
staged/verified installer. Previous application is retained at
`/Applications/.vanta-install-backups/update-8EWbO7/Vanta.app`; the adjacent
receipt records previous and installed hashes. A fresh private profile backup,
complete-history verified Git bundle and scoped patch are retained separately.
No profile migration, CLI-launcher replacement or automatic cleanup occurred.

- Candidate/installed ASAR SHA-256:
  `ce4e618704bc77a67672820ad662be7ec7e14c94d78544266827809296d37900`.
- Apple submission `e0d634e7-97c6-48c8-a646-1b4842c76b00`: Accepted.
- Candidate and installed signature/ticket validation and Gatekeeper: accepted.
- Fresh post-staple local ZIP: `Vanta-0.1.0-local.20261025-shell-notarized-arm64.zip`,
  approximately 198 MiB; SHA-256
  `c7fe960cbb88d0f527017591a422bf031a652ee986e42f6ddf712daeb63e6dd1`.
- Electron 43.8.1, 247 staged runtime packages, no escaping runtime symlinks.

## What changed

Ordinary connection startup no longer masks the app with animated CONNECTING.
Passive unresolved provider checks no longer replace the shell. Confirmed setup
has no artificial 1,180 ms exit timer, scramble text or fading wait; actual
confirmation/acknowledgment is still awaited, duplicate input guarded, and a
failed acknowledgment remains retryable. Explicit setup/sign-in, real errors,
approval boundaries and interrupted-update holds remain available.

No whole visual redesign is claimed. The reference is now measured rather than
guessed: [Codex design dossier](reference/codex-2026-10-25/DESIGN-REFERENCE.md),
scoped normalized tokens, inventory, contrast findings and source-location
verification. All 375 shipped CSS entries were parsed; this does not reconstruct
all native or JavaScript-generated styling. No reference implementation/assets
were transplanted into the application.

## Executed acceptance and gaps

Source checks: connecting/recovery/update-hold 28 cases; passive-readiness
15 cases; final confirmation/provider/owner-store 55 cases (overlapping groups,
not an additive unique total). Renderer typecheck passes. Four changed production
files have no new/worse size findings against the baseline (28 inherited), all
five architectural boundaries hold, staged secret scan and diff checks pass.

Actual packaged candidate: all 13 chat/approval/restart steps and seven probes
pass. One browser vibration warning is recorded, not hidden. This covers remembered
project-scoped Always, cross-project asking, Plan surviving restart, consequential
commands still asking, 200 KB paste, image submission and three window widths.

Actual candidate **and installed-path** startup observation: 16 checks pass,
zero renderer errors and zero model turns submitted. A DOM observer attaches
before the cold visible UI: shell/composer and compact status appear with no
routine full-window Connecting or passive Preparing surface. Actual renderer
reload, draft/sidebar navigation and manual Settings → Providers → API keys
remain reachable. Overall startup proof is **PARTIAL**, not green: both runs
miss sustained typing/navigation while still connecting because connection
finishes before/during the actions. No delayed/fake readiness was introduced.
Component coverage does not replace that missing timed end-to-end leg.

The initial driver failure used progress 100 against the public native runtime
contract's progress 1. Its full failure evidence is retained. After reading the
actual contract, the corrected driver uses `runtime.ready/running:false/1` and
keeps two-frame status timing observational, not a fabricated gateway deadline.
Corrected driver SHA-256:
`30e376d24f74154e9ee2080004160b54a0b5e06379fa3142a9fe8cd7d509060c`;
observer `c1db413c453bd60d7675a63822fefcfeb6334477dcc7095050dce013b9de1a9c`.

Actual `/Applications/Vanta.app` chat/approval/restart replay also passes all
13 steps and seven probes, with the same single browser vibration warning.
The candidate result is not substituted for this separate installed-path run.
No fresh split-Find, owner profile or full application-suite run was performed.

## Remains open

- Full restart continuity: earlier actual `4a2f4ab8` proof passes ten checks,
  then loses unsent image attachments. No attachment-custody fix is in this
  delivery; later queue/unread phases were not reached. See
  STARTUP-SHELL-FIRST-2026-10-25.md for the scoped storage re-entry.
- Whole-CLI startup prewarm occurs before policy loading; direct settings/export
  tests do not establish zero effects for that entire CLI path. See
  POLICY-RECOVERY-2026-10-25.md. Ordinary installed terminal CLI is not certified
  updated by replacing Desktop.
- Reference live UI access was safety-refused. Current computed styles,
  hover/focus, native shadows and full design reproduction are unverified.
- Owner visual/parity, normal-profile confirmation, live accounts/native control,
  physical microphone, audible VoiceOver and deferred unfamiliar-person proof.
- Dependency security: runtime production six findings, Desktop 26 in retained
  graph audits; GitHub still reports 166 default-branch alerts. These graphs are
  not additive and source pushes do not fix an unmerged default branch.

Original 273 work files, roadmap statuses/Done/dependencies and legacy capabilities
are preserved. No broad card completion, main merge, new tag/release, PR reopening,
paid service or CI activation. Whole delivery goal remains active.
