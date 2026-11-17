# Vanta Desktop 0.1.1 — 17 November 2026

Withdrawn signed acceptance candidate, retained as a draft after the native
update test below failed. Do not use it as the normal Desktop download. Its
source tag and verified artifacts remain retained; CLI/kernel Latest is separate.

## Changes

- Restore the complete Send/Stop circle by removing the redundant inner rounded
  clip. Outer rounding, shadow, control size and position are unchanged.
- Refuse undecodable PNG/JPEG originals before they become saved, sendable
  attachments. Keep existing text/files; preserve valid image/file drafts across
  restart and chat switching. No broader filesystem access was added.
- After skipped model setup and a missing-key rejection, reopen the existing
  provider picker. Retain the rejected request for explicit restoration and
  sending; never automatically resubmit it.
- Add a native Check for Updates path: metadata-only discovery, exact approved
  download, idle/draft/custody fences, publisher verification and retained
  rollback. Isolated or environment-overridden launches cannot use native
  restart because macOS does not preserve those launch arguments.

## Exact signed ZIP

| Field | Value |
| --- | --- |
| Version / tag | `0.1.1` / `desktop-v0.1.1` |
| Source | `819a67da9a6d0ba1e142ee0690bdf06b1d49ba30` |
| ZIP bytes | `213744548` |
| ZIP SHA-256 | `224972df0835daec7267611c16e48267f1a4f4b6ab4dc5b9beae9679b9c8dfc3` |
| Declared source SHA-256 | `a3f01745e8aa31d4020d9e2a14ba762e13e0d99f446a07f306064ed3aa2a0b6e` |
| Assembly SHA-256 | `58be68965f15da0a3254a60009cf89b417b87301928c08031b29385d80e8b672` |
| Notarized app SHA-256 | `964ba6c57d68c15ec8a4affff1038f7a0d09ea462278988485ed6519f297e191` |
| Apple submission | `760f8907-ff0f-4bd8-86f5-ed68d3af37f0` — Accepted |

Node 22.23.1, Electron 43.8.1, clean declared source. These are recorded
source/assembly inputs, not a claim of a hermetic reproducible build.

## Executed acceptance

- Deep strict signature, Apple acceptance, staple validation, Gatekeeper and
  final ZIP extraction/app fingerprint agreement passed.
- Isolated installed-copy replay: corrupt image refusal preserves text/file;
  valid PNG bytes, file and unsent text survive actual quit/relaunch; same-chat
  submission/follow-up and another-chat return work without draft bleed.
- Send, Stop and attachment states at 500/800/1440px plus actual split panes:
  11 controls, 176 circle hit points, zero misses; screenshots inspected.
- Seven first-launch checkpoints passed, including offline local-model retry,
  explicit rejected-message restoration with zero requests, exactly one
  explicit local fixture response, and configured restart/chat/draft continuity.
  Both replays captured zero renderer errors; no paid/live provider was used.
- Focused source checks and both renderer/Electron typechecks passed; no fresh
  whole-product suite was run. See the dated attachment, composer, first-launch
  and [updater evidence](../desktop-update-integration-2026-11-17.md).

## Delivery gates still open

The owner-approved native attempt downloaded and verified the ZIP and passed
draft/custody/runtime preparation. It then refused before app replacement:
`codesign -R` interpreted the publisher requirement as a filename because the
expression lacked its `=` prefix. Drafts and attachments remained intact. The
same publisher verification passed on the actual signed installed app after
correcting that prefix in source. A focused regression captures the exact
argument. This does not establish native replacement/relaunch of the correction.

This candidate was returned to draft status without deleting its tag or assets.
**Actual Squirrel replacement/relaunch is not yet verified.** Final DMG
generation follows that gate; no DMG is implied by this candidate ZIP.

An enabled Send while a previous rejected draft remains unresolved is a known
usability limitation: use Restore without sending with an empty composer, then
send explicitly. The safety fence is not bypassed. Original tester-input
incident closure, corrupt TIFF, live accounts, full accessibility and independent
unfamiliar-person acceptance remain unverified. Protected main and dependency
alerts are not cleared by this Desktop release.
