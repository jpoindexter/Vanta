# Vanta Desktop 0.1.2 — 17 November 2026

Withdrawn signed acceptance target, retained as a draft after the native update
test below failed. Not the normal Desktop download. CLI/kernel `v0.9.8` remains
global Latest; source tag, exact artifacts and app/data rollback are retained.

## Changes

- Restore the complete Send/Stop circle without changing outer composer shape,
  shadow, padding or button size. Actual narrow and split-pane checks pass.
- Refuse undecodable original PNG/JPEG images before custody admission, retaining
  typed text and existing attachments. Valid file/image drafts survive restart.
- Reopen provider setup after skipped setup plus a missing-key rejection. Restore
  the saved request explicitly, then send; setup does not resubmit it.
- Native updates require fresh confirmation for the exact release, verify ZIP
  bytes and publisher, save/flush drafts, refuse busy or unresolved work and retain
  rollback before staging/restart. No automatic ambiguous-result retry.
- Correct the actual macOS publisher requirement expression and retain actionable
  errors in the update UI. The failed 0.1.1 candidate remains privately retained
  as a draft with its source tag and artifacts, not the normal download.

## Exact notarized ZIP

| Field | Value |
| --- | --- |
| Source | `9cbddb68d3793847a50a21c393a960fc374ad676` |
| ZIP bytes | `213744564` |
| ZIP SHA-256 | `2971d8e9c2456133658e9abc0859feaeaa2c66f0dba727ced58ad1c437e99901` |
| Declared source SHA-256 | `65caa77050442fde8532a35e5e17d4eb831e866b9b5b57ec03930b0747a65384` |
| Assembly SHA-256 | `7de06207bdcd6612433bc3a6793fdb27951e2cb73d4833f585c26f2f67c935fb` |
| Notarized app SHA-256 | `1522a1a8f8439db75ba1fa08d6c3e8278e2d47f6779647675bb5cf028e3c3016` |
| Apple submission | `60b21be6-a604-4021-b9df-ddd23003d9ee` — Accepted |

Node 22.23.1, Electron 43.8.1, clean declared source. Recorded fingerprints are
not a hermetic/reproducible-build claim. Staple, Gatekeeper and final ZIP
extraction/app fingerprint agreement passed.

## Executed behavior

The exact signed 0.1.2 bundle passed attachment refusal/restart, same/other-chat
continuity and real split panes. Eleven Send/Stop/attachment controls at
500/800/1440px supplied 176 inside-circle hit points with zero misses.
Seven first-launch checkpoints passed: missing setup, choose-later/restart,
retained draft, provider recovery, stopped-endpoint retry, explicit restoration
without submission, exactly one explicit local model response and configured
restart continuity. Both replays captured zero renderer errors. No live account,
paid model, feedback report or microphone was used.

The exact publisher-check correction passed against real signed bundles;
focused regressions and applicable source typechecks passed. No full suite was
rerun. Failed/contaminated fixture attempts remain separate from passing evidence.

## Remaining delivery gates

The owner-approved native attempt passed the corrected publisher verification
but refused before replacement when hashing `app.asar`: Electron's ordinary
filesystem API treats that archive as a virtual directory. The source correction
uses Electron's `original-fs` only for raw archive bytes; no global ASAR toggle
or permission change is used. Actual Electron, rather than a Node-only proxy,
reproduced the refusal and then retained a verified private rollback and receipt
with exact matching archive hashes. This is not full native update acceptance.

This candidate was returned to draft status without deleting its source tag or
artifacts. **Native replacement/relaunch has not yet passed.** No DMG is
published yet; final DMG production waits for that acceptance, not a green build.

Native updating refuses isolated or environment-overridden launches because
macOS restart does not preserve their arguments. A prior rejected draft must be
resolved with Restore without sending before a new submission; the enabled Send
appearance during that fence remains a usability limitation. Original tester
input, corrupt TIFF, full accessibility, unfamiliar-person acceptance and
default-branch dependency-alert clearance remain separate/unverified.
