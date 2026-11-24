# Desktop installation: Hermes comparison and Vanta delivery gaps

17 November 2026. Owner: Jason. This is an inspected-artifact and planning
checkpoint, not a new installer release or clean-machine acceptance.

## Decision

Ship a normal signed/notarized Vanta DMG containing the already-bundled app and
an Applications shortcut. On first launch, expose only missing setup with a
specific next action and recoverable errors. Reuse the existing runtime,
provider settings, diagnostics and staged installer; do not add another shell,
Python environment, source checkout, toolchain or privileged background service.

The job is: **download Vanta, install it, connect a model, and start a useful
conversation without understanding the runtime.** Installation, first-launch
setup and updating are separate proof boundaries.

## What was inspected

### Downloaded Hermes DMG and app — observed

- `Hermes-Setup.dmg`: 6,752,854 filesystem bytes; SHA-256
  `b61e047efe3059faf1c55fec3252e661f2d2a993a7a3eebf5cc6a9aa5c1790f5`.
- REA opened the actual DMG and inventoried its container entries: complete
  container-entry coverage, 12 graph nodes, 13 occurrences, no integrity
  contradictions. This does not establish runtime or downloaded payload safety.
- The mounted volume contains `Hermes.app` and an Applications shortcut.
  Both the mounted and installed setup executables have SHA-256
  `77bc5f19ca5bb53442524b2f400a42032e2a0effa27d34b5453654fb9e53e261`.
- The app declares version `0.0.1`, bundle ID
  `com.nousresearch.hermes.setup`, executable `Hermes-Setup`, arm64 and minimum
  macOS 11. It is a small bootstrap app, not the complete Electron desktop.
- `codesign -dv` reports Developer ID signing and a stapled notarization ticket.
  That metadata inspection is not a fresh Gatekeeper/signature-validation run.
- The supplied screenshot shows the setup stage list, current progress, elapsed
  duration, Show details and Cancel. Its nine stages include Python dependency
  provisioning and gateway configuration. Retry/cancellation behavior was not
  exercised; the running Hermes installation was not interrupted or restarted.

REA evidence retained privately: DMG inspection
`ev_ad61cc1b74eef8138bed29d646d7a64205b5cc181c0287f9f4fb54391c57e13f`;
app directory inspection
`ev_f0f06f0579fba244a78ce6335069fc04bc4c8bbde3d12b060f8b8fab6f399ed4`.
The app scan's digest covers inspected metadata/read ranges, not every byte.
The evidence bundle was exported and the REA target closed.

### Current Hermes source — inspected, artifact correspondence unknown

Pinned main at inspection:
`7abd4a227e6eacbf34977e3ed4c56bea895ce1cc`. This is **not proven to be the
source revision of the downloaded setup app**.

- [Bootstrap orchestration](https://github.com/NousResearch/hermes-agent/blob/7abd4a227e6eacbf34977e3ed4c56bea895ce1cc/apps/bootstrap-installer/src-tauri/src/bootstrap.rs)
  retains a running handle, refuses concurrent bootstrap, exposes status and
  cancellation, and resolves the installed desktop before launch.
- [Progress screen](https://github.com/NousResearch/hermes-agent/blob/7abd4a227e6eacbf34977e3ed4c56bea895ce1cc/apps/bootstrap-installer/src/routes/progress.tsx)
  shows stage completion, elapsed time, optional logs and Cancel.
- [Failure screen](https://github.com/NousResearch/hermes-agent/blob/7abd4a227e6eacbf34977e3ed4c56bea895ce1cc/apps/bootstrap-installer/src/routes/failure.tsx)
  offers explicit Retry and Open logs instead of an unexplained blocked state.
- [Script resolution](https://github.com/NousResearch/hermes-agent/blob/7abd4a227e6eacbf34977e3ed4c56bea895ce1cc/apps/bootstrap-installer/src-tauri/src/install_script.rs)
  supports downloaded commit/branch-selected scripts. Vanta should not inherit
  branch-following executable downloads for ordinary packaged installation.

No Hermes code/assets were copied or executed for this audit.

### Vanta — observed source/package/release boundaries

- Current public Desktop is normal `desktop-v0.1.0`: its release API lists the
  ZIP, checksum and manifest, **no DMG**. CLI/kernel `v0.9.8` remains separate.
- The actual installed app reports `0.1.0` and embeds runtime and kernel
  resources. Its [installation receipt](desktop-v0.1.0-install-2026-11-17.md)
  records the exact bundle, retained rollback and visible history/readiness.
  This owner-machine upgrade is not a first install on a clean Mac.
- `desktop-next/tools/package-vanta.mjs` builds/signs/archives a self-contained
  app as ZIP. `electron-builder.config.cjs` already declares DMG and ZIP targets,
  Applications-link placement and Vanta DMG artwork. A config declaration is not
  a generated, validated or publicly downloadable DMG.
- Existing packaging helpers already provide provenance, staged replacement,
  signature checks, retained rollback and final ZIP/app fingerprint agreement.
  Extend these seams rather than inventing a second installer/update framework.
- The normal provider picker works without `guestOnboardingEnabled`; that flag
  gates the inherited guide-chat, not model setup. Signed 0.1.0 fresh-profile
  proof reached setup and a local fixture response. Choosing a provider later,
  restarting and sending exposed a separate missing-key recovery defect; its
  source repair still requires replay in the rebuilt signed candidate.
- The installed release has updates unconfigured. Source discovery/download and
  runtime-quiescence work is separate and not yet a delivered native updater.
- `docs/installation.md` still advertised the old `v0.9.5` DMG and source rebuild
  as the installed-app update path. This checkpoint corrects that guide.

REA's Vanta app directory scan was deliberately bounded to 300 entries and is
partial. Bundled resources and existing install evidence, not that scan alone,
establish the package observations above.

## Small delivery cards and proof

| Canonical card | Next bounded work | Actual Done evidence |
| --- | --- | --- |
| [`DESKTOP-MAC-DMG-DELIVERY`](https://trello.com/c/N3qDsjui) | Produce a DMG around the same final notarized app; reuse artwork and packaging checks | Download the public DMG, compare checksum, validate DMG and app signing/notarization, mount, install into an isolated Applications destination, launch exact app/version; corrupt/untrusted input refuses without replacing current app |
| [`DESKTOP-FIRST-LAUNCH-READINESS`](https://trello.com/c/xZkqzCOw) | Connect existing setup/settings to a minimal, truthful first-run flow | Fresh packaged profile without development tools reaches model setup and one response; offline/missing-auth/cancel/relaunch recover without resetting data, copying credentials or granting permissions |
| [`DESKTOP-SIGNED-AUTO-UPDATE`](https://trello.com/c/CuF31GKo) (existing) | Native update integration, work-safe restart and rollback | Two signed packages prove discovery through exact-version relaunch, preserved drafts/attachments/queues and failed-update recovery; never infer this from a DMG or working button |
| `DESKTOP-COLD-OPERATOR-RELEASE-PROOF` / `UX-04` (existing) | Independent usefulness and accessibility acceptance | Keep the existing unfamiliar-person and cross-host gates; do not duplicate or silently close them |

Owner's subsequent delivery order: attachment/edge repairs → first-launch
recovery and native updater acceptance → final DMG delivery. The original
DMG-first suggestion is superseded; first-launch proof can use a signed ZIP.
These are
proof-sized backlog slices, **not additional Building lanes or a promise that
all are already implemented**. Existing 12-open/2-Building limits remain.

Adopt truthful stage state, specific recovery, optional redacted details and a
verified launch handoff. Skip Python/toolchain installation, compulsory CLI
installation, blanket permissions, nine fake progress steps, repeated startup
loading screens and new branding. Request computer-control permissions only
when the user enables that capability; model setup must not grant action
authority. No paid service or new dependency is required by this plan.

## Not checked

No Hermes install/cancel/retry or downloaded agent execution; no complete
Hermes security audit; no new Vanta DMG generated or published; no clean-Mac,
new native updater, original attachment-incident or composer-edge acceptance.
Existing source work, owner app/data, credentials and backups remain untouched
by this audit. Review each card at its exact proof checkpoint, not by appearance.
