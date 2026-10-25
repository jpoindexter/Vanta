# Policy-preflight Desktop delivery — 2026-10-25

## Installed identity and recovery

`/Applications/Vanta.app` now contains source `510e0450`
(`510e045072ac4019e5209a33bd5b168aef674faf`), version
`0.1.0-local.20261025.policy`, built `2026-10-25T17:13:56.373Z`.
The exact candidate was Developer ID signed, Apple Accepted, stapled and
Gatekeeper accepted before the existing staged installer replaced the stopped
app. No owner app was quit and the normal profile was not launched.

- Candidate/installed ASAR SHA-256:
  `0e8461b1382691a5033cd7f57a6539ec33d364b504f6a1cd80a35e124ea00a4a`.
- Apple submission `c034bad2-e95f-45a2-951c-9dda3915b587`: Accepted.
- Installed deep/strict signature, staple validation and Gatekeeper: accepted.
- Previous `536e17fb` app retained at
  `/Applications/.vanta-install-backups/update-5lB8PV/Vanta.app`; adjacent
  `receipt.json` binds previous and installed hashes.
- Fresh stopped-profile backup, complete-history verified source bundle,
  reviewed proof drivers and receipts are in private checkpoint
  `Vanta-backups/prewarm-custody-20261025-CBOp8C`.
- Fresh post-staple local ZIP:
  `Vanta-deliveries/2026-10-25/Vanta-0.1.0-local.20261025-policy-notarized-arm64.zip`,
  SHA-256 `56d47c4617e98179a6b2f8a289ee65d594643a64a5ada4c0b96dbf01a3f2a38c`.
- Electron 43.8.1; 247 staged runtime packages; zero escaping runtime symlinks.

## Executed acceptance

The change and source evidence are recorded in
[CLI-POLICY-PREFLIGHT-2026-10-25.md](CLI-POLICY-PREFLIGHT-2026-10-25.md).
Source typecheck, 18 focused cases, four-production-file size gate, five
architecture boundaries, staged secret scan and diff checks pass.

Parent separately executed the actual candidate and installed bundled CLI:
`run` 18/18, configured `chat --no-tui` 5/5, unconfigured chat 4/4 at each path.
Each run had 20 normal/bare invalid-policy cases: exact recovery path, retained
settings bytes, no policy-environment application and zero attempted
fetch/socket/TLS/subprocess effects. Seven deliberate safe-mode controls reached
kernel attempts; all were denied by the proof. The local Yoga WASM decode,
private-home/preseeded-Git fixture and synthetic provider limitations remain.

Actual candidate and `/Applications/Vanta.app` also separately pass all 13
chat/approval/restart steps and seven probes with a scripted local model. They
exercise remembered project-scoped Always through restart/new chat, cross-project
asking, Plan persisting and blocking writes, irreversible operations still asking,
200 KB paste, actual image submission/chip clearing and 1440/1100/800px layouts.
One existing browser vibration warning is retained in each receipt; it is not a
renderer exception. Installed post-paste maximum sampled keystroke latency is
129 ms for that fixture, not a general performance guarantee.

Receipts in the private checkpoint: `candidate-done-path/`,
`installed-done-path/`, `packaged-cli-{run,chat,unconfigured}/`,
`installed-cli-{run,chat,unconfigured}/` and `install.json`.

## What this does not close

The terminal `vanta` launcher was not replaced. Executing the installed app's
bundled CLI is not proof that an unrelated PATH checkout updated. Initial
environment/vault/profile initialization, arbitrary CLI commands, real TTY/setup,
owner profile, live providers/accounts and physical device workflows remain
outside these proofs.

Image-draft cold-restart continuity is still open. An isolated experiment is
preserved but not integrated; see
[DRAFT-CUSTODY-REENTRY-2026-10-25.md](DRAFT-CUSTODY-REENTRY-2026-10-25.md).
Later queue/unread acceptance is not inferred from ordinary chat tests. No new
startup-timing proof was run: the earlier `536e17fb` observation remains partial
for sustained interaction while connecting.

The first-surface composer proposal is review-only, not installed:
[interactive proposal](design-proposals/composer-first-surface-2026-10-25.html).
It has 19 parent browser interaction/layout checks, light/dark/narrow captures,
zero JavaScript errors and no remote requests. Owner approval, full contrast,
zoom and assistive-technology acceptance remain open; no shared-token migration
or whole visual redesign is claimed.

Original 273 work files and all 1,364 roadmap IDs/statuses/Done/dependencies are
preserved. Dependency security is not green: retained runtime/Desktop audits
remain unresolved and GitHub reported 166 default-branch alerts on the source
push. No main merge, PR reopening, tag/release, legacy deletion, paid service,
CI activation or broad card completion. Whole delivery goal remains active.
