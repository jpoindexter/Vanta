# Unsent image custody — parent application review

## Status: source experiment advances; not promoted or installed

The installed `71cf90cf` recovery build still loses unsent image attachments
after restart. The parent reproduced that exact installed path with a private
HOME, VANTA_HOME, Electron userData and loopback model. Ordinary chat, original
PNG preview bytes, restored text and no automatic model replay passed before
the missing-image control failed. This is fresh installed evidence, not an
inference from the older `4a2f4ab8` run.

An isolated archive of integration source `c6b7e444` plus the preserved custody
candidate now executes both direct image recovery and a queued-image crash
journey. Application changes remain external, not in the shared application
source. The existing sidebar/titlebar review patch remains unapplied. No owner
profile, account, clipboard contents, installed app or appearance preferences
were read or changed. Paste uses a synthetic browser event carrying actual PNG
bytes; this is not physical OS-clipboard acceptance.

## Three application defects found and corrected in isolation

1. The original candidate demanded a remembered registry-owner hint before
   sending. Supported profile-only local primaries can legitimately have no
   hint, so ordinary first-send failed before any model request. The correction
   uses the existing session-owner resolver. A profile-only owner must match
   the captured profile and resolve through the same native connection door as
   RPC dispatch to a local descriptor; ambiguous/unknown owners, remote
   overrides and changed owners fail closed. The asynchronous guard is awaited
   at the invocation boundary and shared by direct and queued sends.
2. A killed process can retain native queue custody but lose its Chromium
   projection. Native recovery previously published that queue without a pause,
   allowing automatic dispatch. New native recovery now marks the queue
   restored/paused before publishing it; ordinary new staging is unchanged.
3. The cross-window drain claim intentionally reads the latest persisted cache,
   whose image bodies have been stripped. The original native send wrapper
   passed only callbacks, leaving foreground/background drains to submit those
   stripped records. It now passes the validated native text/image envelope
   to both existing submit paths. Cache pointers are not send payloads.

The queue replay established each correction separately: after the pause
correction it reached deliberate Send now and failed the image hash; after the
payload correction the exact image/text and acknowledgment checks passed.
Failed attempts, full Playwright call logs, screenshots and native fixture data
are retained, not replaced by the final results.

## Executed evidence and its limits

- Final direct source-Electron replay: **6 checks**, two loopback requests,
  zero renderer errors. Exact unsent text and PNG preview SHA-256 survive full
  restart; history reopening makes no request; deliberate send delivers that
  exact text and PNG once.
- Final queue source-Electron replay: **4 checks**, two loopback requests,
  zero renderer errors. A busy turn accepts one native queue entry. After
  SIGKILL/restart the same ID remains paused without resurrecting its source
  draft or sending anything. Deliberate Send now delivers the exact text/PNG
  once; native acceptance retains the returned runtime identity without the
  consumed body/images. This is process-crash, not power-loss proof.
- Final focused renderer/source tests: **61 passed in 9 files**. This
  supersedes overlapping 51/59/33-case intermediate runs; do not sum them.
- Native custody: **25 passed in 4 files**; those native files were unchanged
  by the later renderer corrections. Renderer and Electron typechecks exit 0.
  The final Vite/main/preload build exits 0; existing font/chunk warnings remain.
- One Node HTTP-fixture regression passes. It catches the previous receipt
  parser's extra newline for image blocks and verifies that receipts contain
  image hashes, not image bodies. Production text handling was not changed to
  satisfy a faulty receipt projection.
- **Size gate fails: 34 new/worse findings across 43 production files checked
  against the recorded baseline.** No baseline rewrite, suppression or bypass.
  The full application patch is therefore not eligible for source promotion.
- All 239 pre-existing dirty regular files remain hash-identical. The index
  was empty before the scoped proof/documentation checkpoint.

These source replays do not establish packaged/installed acceptance, full
accessibility, owner visual acceptance, remote durability, authenticated
accounts, complete queue editing/HUD continuity or whole-app completion.

## Frozen re-entry

External retained packet beside the checkout:
`Vanta-backups/image-custody-integration-20261025-ciSW9C/`.

- Current-base combined patch: `PARENT-CANDIDATE.patch`, **60 files**,
  246,633 bytes; SHA-256
  `91aa7e429f6d6986ba7a4812d7b1f1fb6dcb81fb1e0b0783cf81476ee7ce2a07`.
- `PARENT-PREIMAGES.json` records original/new file hashes; SHA-256
  `7ee5ed3f563cd64356a34be3485a6ca34a2a6b0b9aebaf08e70a7efab8206dd7`.
- Original 56-file worker packet and every intermediate proof remain intact.
  Do not apply its older patch in addition to the current combined patch.
- Only the two loopback receipt-fixture files are promoted by this checkpoint.
  Their deltas remain in the combined patch for reproducibility; skip those
  already-applied files when rebasing the remaining application changes.
- `image-restart.mjs`, `queue-restart.mjs`, `parent-final-source-image/`,
  `source-queue-exact-payload/`, final focused/typecheck/build logs and
  `parent-final-size-review.log` are the executed evidence. The two proof
  scripts select their isolated source through `VANTA_PROOF_SOURCE`.

Next: reduce the identified size/complexity growth without weakening validation,
then review positive legacy migration, GONE/Undo/compression, same-ID text scope,
queue edit/cancel/save, foreground/HUD transitions and unknown-send recovery.
The persistent Waking up indicator seen during these runs is not repaired by
the custody changes. Preserve source/native records and rerun the narrow real
journey after each relevant correction. Only then integrate, package, sign,
notarize, install with rollback and repeat against that exact build. DN-29 and
the local-state boundary card remain open; no release, tag or main merge.
