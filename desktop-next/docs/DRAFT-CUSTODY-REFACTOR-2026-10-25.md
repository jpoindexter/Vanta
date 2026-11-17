# Unsent image custody — refactor and queued-edit proof

## Status: isolated candidate, not installed

This advances the [parent review](DRAFT-CUSTODY-PARENT-REVIEW-2026-10-25.md).
Its 34 new/worse size findings are now resolved in a separate source snapshot,
without changing the baseline, suppressing checks, or removing validation.
The frozen parent snapshot remains byte-identical across its 60 manifest files.
The application patch is still external: further continuity review precedes
source integration and exact-source packaged/installed acceptance.

The installed `71cf90cf` application and the unapproved sidebar/titlebar review
are unchanged. This is engineering continuity work, not another design theme
or owner acceptance of the whole app. No credentials, live account, owner
clipboard or normal-profile data were read or changed.

## Refactored seams

- Shared image, snapshot and queue-record validation is separated into named
  checks, retaining limits, canonical-base64 checks, errors and outputs.
- Native persisted-send parsing and assignment validation live in a small
  native module. Send cleanup still awaits persistence before releasing its
  in-flight latch; error recovery and owner fences remain.
- Renderer recovery transitions, owner-route resolution and notice/status
  decisions are separated without changing their public contracts.
- Reserved composer sends have one scoped dispatch module. Captured owner,
  scope assignment, text revision, attachment occurrence IDs and unknown-send
  recovery remain bound to the original operation.
- External composer requests have a dedicated hook retaining visible-surface
  ownership, busy steering, hidden-note semantics and queued fallback.
- Queued-text preparation and native edit completion reuse shared helpers.
  Late save completion cannot overwrite newer words or another edited entry.

The two older composer orchestration hooks still contain inherited oversized
functions. Passing the unchanged ratchet means no new/worse findings, not full
modularization or elimination of the 76 existing findings on the checked paths.

## Executed evidence

- Size gate: **47 production files, no new/worse findings**, 76 inherited.
- Shared-validator differential: **33 cases**, matching the frozen parent's
  returned values and error messages. Not an exhaustive input-space proof.
- Focused hook checks: **94 cases in six files**. Five additional native-edit
  completion cases cover acknowledged cancel/step restoration, newer words,
  another edited entry and rejected persistence.
- Focused custody checks: **61 cases in nine renderer files** and **25 cases
  in four native files**. These overlap the hook checks; do not sum them into
  a unique test total. Renderer and Electron typechecks exit zero.
- Final Vite renderer and Electron main/preload build exits zero. Existing
  font and chunk warnings remain.
- Actual source-Electron direct image restart: **six checks**, two loopback
  requests, zero renderer errors; exact text and original PNG preview/send
  SHA-256 survive restart, with no history-triggered model request.
- Actual source-Electron queued-image crash/restart: **four checks**, two
  loopback requests, zero renderer errors; the same paused queue ID survives,
  no source draft is resurrected, and deliberate Send now submits once.
- Extended source-Electron queued edit: **six checks**, two requests, zero
  renderer errors. After crash/restart, Edit then Cancel restores a separate
  unsent draft without changing the saved entry. Edit then Save retains the
  original ID/PNG, saves exact revised text and restores that separate draft
  without a send. Deliberate Send now delivers only the revised text and PNG.

The extended queue journey is retained in
`desktop-next/tools/proof/custody-queue-continuity.mjs`; select the isolated
source explicitly with `VANTA_PROOF_SOURCE`. It uses private HOME, VANTA_HOME,
userData, projects and a loopback model. Paste is a synthetic browser event
carrying real PNG bytes, not physical OS-clipboard proof. SIGKILL affects only
that private application process, not the installed app.

## Frozen packet and remaining work

Retained beside the checkout:
`Vanta-backups/custody-refactor-20261025-z1KDyG/`.

- `REFACTORED-CANDIDATE.patch`: 64 files, 266,684 bytes, relative to
  `37d1a3fb44fc2a504c95caf33dc72ff12e6b06d5`; SHA-256
  `8c07ee194e89c1459f248bca455d5da1c712b67a29d7e6cb8fb18e23763f0c49`.
- `REFACTORED-PREIMAGES.json`: before/after file hashes; SHA-256
  `c28c5c1f63bda9e6f8a95d621b0d4fddc7e574949cb067efaf315035ee1a9e5a`.
- One already-promoted HTTP fixture is present only as import relocation;
  its behavior is unchanged. The other promoted fixture is byte-identical
  and absent from the refined patch. Do not apply old and refined patches together.
- `git apply --unidiff-zero --check` accepts the refined patch against the
  current checkout without applying it. Source has not been promoted by that check.
- `refactored-image-restart/`, `refactored-queue-restart/` and
  `refactored-queue-edit-restart/` retain result JSON, request ledgers and captures.
  Final focused/typecheck/build/size logs and the original comparison scripts
  are retained with them. All 239 pre-existing dirty regular files remain
  hash-identical; this checkpoint does not stage them.

Next engineering review: positive legacy migration, GONE/Undo/compression,
same-ID text-owner scope, foreground/HUD transitions and real unknown-send
timing. The bounded queued Edit/Cancel/Save path above is now executed, but
cross-owner and cross-surface editing remains separate. The persistent Waking
up indicator is not fixed here. Then integrate and run exact packaged and
installed continuity with recoverable rollback. Keep the local-state boundary
and DN-29 open. No main merge, tag, public release, CI or paid service.

Not established: complete legacy parity, power-loss/cross-process atomicity,
full accessibility, live-account behavior, owner visual or human acceptance,
new packaging, installed recovery, or whole-goal completion.
