# Draft text — failed-read preservation and unresolved owner scope

## Status: isolated application correction, not installed

The [refactored custody candidate](DRAFT-CUSTODY-REFACTOR-2026-10-25.md) is
preserved unchanged. A fresh copy reproduces two text-storage defects:

1. A store-level fixture writes a draft under profile A, changes the active
   local descriptor/profile to B, and reads A's text under the same bare session
   ID. This demonstrates missing text-key isolation, not a live-account or
   native-app account disclosure. **The owner-key defect remains unresolved.**
2. A malformed persisted text snapshot is caught and returned as an empty map.
   `reloadPersistedDrafts` interprets that as authoritative deletion and clears
   known text, images, revision and title. A failing regression records exactly
   that empty result. Owner-aware migration cannot safely build on this behavior.

## Correction in the isolated candidate

- Text-storage reads distinguish failure (`null`) from a valid empty map.
  Read/write failure is a shared observable state; invalid persisted bytes
  remain intact rather than being repaired by overwriting them.
- Failed reload returns before changing known drafts, titles or revisions.
  The composer reload path also returns before repainting from an untrusted
  snapshot. Genuine empty snapshots still propagate acknowledged deletion.
- One shared, keyboard-accessible inline alert uses the house Button and
  existing surface roles. It says drafts could not be read/saved and asks the
  user to keep the window open. Retry rereads; it never overwrites corrupt
  bytes. A valid read clears the alert. The new copy is present in all nine
  bundled catalogs with its shared type entry.

This does not reconstruct unreadable bytes or promise durable storage while
the store remains unavailable. Cold startup with unreadable text has no
last-known in-memory draft; the alert reports the failure, not successful restore.
Recovery involving newer unsaved edits and a concurrently changed valid
snapshot remains unverified; this slice does not establish conflict arbitration.

## Executed proof and limits

- Original corrupt-read regression failed: expected original words/image,
  received empty text/attachments. The separate owner observation confirms
  the unresolved bare-session behavior; it is diagnostic, not a passing
  isolation guard and is not included in the promotion patch.
- Focused storage/custody/HUD/notice checks: **37 passed in five files**.
  Covers corrupt current and legacy snapshots, inaccessible storage, genuine
  empty snapshots, successful later read and visible Retry semantics.
- Existing composer lifecycle checks: **22 passed** in one file, including
  earlier positive fresh/GONE/rekey behavior. This is not native lifecycle proof.
- Renderer typecheck exits zero. Existing native production code remains
  unchanged. Renderer/main/preload build exits zero with existing font/chunk
  warnings. Size ratchet: **48 production files, no new/worse findings**, 77
  inherited findings on those inventoried paths; no baseline rewrite.
- Actual source Electron: **nine checks**, two loopback requests, zero renderer
  errors. A synthetic shared-storage corruption event retains exact visible
  draft text and PNG SHA-256; Retry leaves corrupt bytes and draft intact;
  restoring a valid fixture snapshot clears the warning without changing the
  draft. Cold restart then retains exact text/PNG; history opening makes no
  model request; deliberate send submits the original text/image once.

The actual-app proof is `desktop-next/tools/proof/custody-draft-corruption.mjs`
with explicit `VANTA_PROOF_SOURCE`. All profiles/projects/processes are private
fixtures; no owner clipboard, account, credentials or normal profile is read.
Paste and the storage event are synthetic browser events exercising the real
renderer path, not OS clipboard, real cross-window timing or power-loss proof.

## Retained source and re-entry

External packet: `Vanta-backups/text-owner-continuity-20261025-EKw9T1/`.

- `TEXT-RECOVERY-DELTA.patch`: 18 files, 16,176 bytes, against the previous
  frozen refactor; SHA-256
  `3ef198fa1f65fbcd04b97a7083a0518c56ce13146d354e64f8741c7ed686bfce`.
- Combined `TEXT-RECOVERY-CANDIDATE.patch`: 76 files, 277,776 bytes, relative
  to `4db8c8cc509766a7bb381d14f75805469cecc475`; SHA-256
  `ac591cfbb2165108b5b0a4a5d63305f85d06a500fa896afd2742ae92377d8f18`.
- Combined preimage manifest SHA-256:
  `3d773f4b255522284682448f8d240461ecc85ad5bdb6342cf3b8b9616202dc64`.
  Dry-run patch application succeeds without applying it. Do not apply old,
  delta and combined patches together.
- `baseline-text-observation.log`, final focused/lifecycle/typecheck/build/size
  logs and `source-text-corruption-restart/` retain executed results and captures.
  The earlier 64-file refactor manifest remains hash-identical. All 239 original
  dirty regular files and the installed app are unchanged.

Next: bind text identities to captured connection/profile/session without
reassigning ambiguous legacy records; cover same-ID profiles, pending writes,
fresh assignment, GONE/Undo/compression and HUD transitions through that same
contract. Then finish unknown-send and packaged/installed continuity. Do not
promote this combined application candidate while its owner gap remains.
No card closure, main merge, tag, release, CI, spend or visual-approval bypass.
