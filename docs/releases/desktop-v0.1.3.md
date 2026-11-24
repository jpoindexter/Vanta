# Vanta Desktop 0.1.3 — 17 November 2026

Normal Apple Silicon macOS Desktop, not an Iris build. Preserve app/data
rollback before updating. CLI/kernel `v0.9.8` remains GitHub's global Latest.
See the [changelog](../../CHANGELOG.md#desktop-v013--2026-11-17) and
[versioned release](https://github.com/jpoindexter/Vanta/releases/tag/desktop-v0.1.3).

## Changes

- Restore the whole Send/Stop circle, retaining the outer composer rounding,
  shadow, padding and button position.
- Refuse undecodable original PNG/JPEG images before saving/submitting them;
  retain existing text/files and valid image drafts across restart/chat switching.
- Reopen model setup after a skipped-setup missing-key rejection. Restore the
  retained request explicitly, then send; no automatic resubmission.
- Native updates use explicit exact-release confirmation, verified ZIP bytes,
  draft/custody/runtime readiness, publisher checks and retained rollback.
  No automatic retry after an ambiguous result.
- Correct both macOS publisher-expression syntax and Electron's raw ASAR
  checksum boundary. Use `original-fs` only for archive bytes; do not disable
  ASAR behavior globally or widen filesystem permissions.

Failed signed 0.1.1/0.1.2 acceptance candidates remain as drafts with their
source tags and exact artifacts. Neither replaced the app through Squirrel.

## Exact signed ZIP

| Field | Value |
| --- | --- |
| Source | `b2847a8f6665a5294d25478dd3cb20ac140a5da6` |
| ZIP bytes | `213744555` |
| ZIP SHA-256 | `02caee3dcb1bd54f04dbf7c7ec037e13ff7fca827f2a7f0d3070ff519cc626df` |
| Declared source SHA-256 | `7f1cbee0cae5902e67eee755ecea3ad4a46cd639b610828fae29fea51e5181cb` |
| Assembly SHA-256 | `f3875dd2a9cbc58fb013281d826f71abfff55146f894158ba27b3dba4c81ab20` |
| Notarized app SHA-256 | `85516a24e84ea57fd80f1f76353879ec616366760745026f1ea26cd009030797` |
| ASAR SHA-256 | `41d95a82d7a2c121b0ee99daf11fccb58eec6b188d38274718d297031d40cdde` |
| Apple submission | `5cb208de-ba7d-4e57-9912-5787493fc692` — Accepted |

Node 22.23.1, Electron 43.8.1, clean declared source. Signature, staple,
Gatekeeper and final ZIP extraction/fingerprint agreement passed. Recorded
inputs do not imply a hermetic/reproducible build.

## Executed evidence and limits

- Real Electron CJS backup preservation and production-format ESM raw archive
  hashing passed; publisher verification and mode0600 rollback receipt matched.
- 0.1.3 passed seven first-launch behavioral assertions over three private
  launches, exactly one explicit local model request, restart/draft continuity
  and zero renderer errors. No screenshots were taken in that hidden-window run.
- 0.1.2 passed full attachment/restart/same-other-chat/split replay and 176 circle
  points with no misses/errors. All 1,044 renderer files in 0.1.3 are byte-identical
  to that signed payload. Separate 0.1.3 corrupt-image/restart and first-circle
  assertions passed, but hidden-window capture stalled; those incomplete runs
  are not reported as a fresh full visual replay.
- Focused regressions, applicable typechecks and architecture gates passed.
  No full suite or live/paid model, account, microphone or feedback send was used.

## Native delivery acceptance

The owner-approved native update from a signed/notarized test seed to this exact
ZIP passed: verified download/publisher, work-safe preparation, retained app
rollback, actual Squirrel replacement and automatic relaunch. Installed version,
full app fingerprint, ASAR hash, signature, stapling and Gatekeeper match the
target above. Native UI readback showed retained history and the unsent synthetic
text/file, and Version & updates `v0.1.3`. No app-state observer was used during
replacement. An earlier observer-induced app-still-running refusal is retained
in the [update record](../desktop-update-integration-2026-11-17.md).

## Signed DMG delivery

[Download Vanta-0.1.3-arm64.dmg](https://github.com/jpoindexter/Vanta/releases/download/desktop-v0.1.3/Vanta-0.1.3-arm64.dmg).

- Final bytes: `198365863`; SHA-256:
  `1e75aa1653498ea668464816c5bf82239c1f06e021914a46344f4fa5ccc21f5a`.
- DMG Developer ID signature, Apple submission
  `e25aa732-757e-4971-b40b-fcf3da1edf64` (Accepted), ticket stapling and Gatekeeper
  passed independently from the app. Image checksums passed.
- Public GitHub asset digest and a fresh public download matched that hash.
  Both local and downloaded images mounted read-only with the app and a valid
  Applications shortcut. Mounted app signature, staple and Gatekeeper passed;
  its full fingerprint matched the notarized app above.
- The downloaded image's app was copied to a fresh private Applications
  destination. That exact installed copy passed all seven first-launch
  behavioral assertions over three hidden/nonfocusable launches, one explicit
  canned request and zero renderer errors. App fingerprint/ASAR were unchanged
  afterward; no private-profile processes or kernel listeners remained.

No fresh screenshots were made in the hidden DMG replay. This is installation
and deterministic setup/chat acceptance, not a separate clean Mac, live cloud
account, complete accessibility or unfamiliar-person test. Native rollback
execution and the complete native failure/offline matrix remain separate from
retaining a verified rollback and passing source-level failure tests.

Isolated/environment-overridden launches refuse native restart because macOS
does not preserve their arguments. Original tester input, corrupt TIFF, complete
accessibility/parity, unfamiliar-person proof, asynchronous late-handoff error
presentation and default-branch dependency alerts remain separate/open.
