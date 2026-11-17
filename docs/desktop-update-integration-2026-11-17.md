# Desktop update integration — 17 November 2026

Source and native acceptance record. The owner
prioritized attachment recovery, the clipped Send/Stop control, first launch and
the native updater **before** producing the final DMG. No card is closed by
this document.

## Scope and preserved work

Extend the existing About/update overlay and native shell; no new updater
framework, dependency, user-data store, Python setup or replacement shell.
Preserve the installed normal v0.1.0 and its rollback, profiles, credentials,
approval state and all earlier work. The previous source checkpoint and private
dirty-file archive remain available. Only exact verified files are staged;
private screenshots, logs, accounts and signing material stay outside Git.

## Implemented source path

1. Native metadata-only checks select regular `desktop-vX.Y.Z` releases from
   Vanta's GitHub releases, not global CLI Latest, draft releases or Iris tags.
   Numeric versions and a matching bounded release manifest bind the archive
   name, platform, size, SHA-256, source revision and reported notarization.
2. Explicit Install invokes a fresh native confirmation for that exact version.
   No passive check downloads or stages a package. The private ZIP download
   limits redirects, size and duration, and checks exact bytes/hash.
3. Every open app renderer acknowledges the existing synchronous text save and
   attachment flush, with readback of storage/attachment readiness. Input is
   temporarily frozen; reload/navigation/crash or a new window invalidates the
   acknowledgement. Native menus/keyboard cannot admit late edits. New mini or
   quick-entry windows are held hidden, not destroyed during their constructors.
4. Native custody drains admitted writes, retaining ready drafts but refusing
   unresolved send/archive/queue checkpoints. Then every **already-started**
   runtime prepares an exact lease, checking sessions, pending approvals,
   persisted queues and detached running work. No profiles are spawned to check.
5. Retain and publisher-verify a rollback bundle before installation. Native
   Squirrel.Mac receives only the private verified ZIP over a tokenized loopback
   feed. The feed binds an open descriptor and holds the final chunk until the
   streamed hash/size matches, including same-size replacement/corruption tests.
6. Squirrel performs native signature verification and replacement. Revalidate
   window generations around stopping the idle app-owned runtimes, then request
   native restart. A handoff is **not** a verified new-version completion.

Ordinary failures release exact preparation leases in reverse order. A failed
cancellation or ambiguous native timeout retains the fences, refuses reentry
and tells the user that work remains paused. A persistent native error observer
prevents a late timed-out operation from crashing the main process. Nothing
automatically retries an uncertain result or resumes queued work.
Reentry also remains blocked after a failed lease release or while a successful
native restart handoff is still finishing; neither path starts another install.

The existing macOS menu now exposes Check for Updates; About and the update
overlay use the same native path. Unsupported launches receive a reason rather
than a false working-updater claim.

## Native relaunch boundary

The exact Electron 43.8.1 dependency pins Squirrel.Mac at
`0e5d146ba13101a1302d59ea6e6e0b3cace4ae38`. Its
[ShipIt relaunch](https://github.com/Squirrel/Squirrel.Mac/blob/0e5d146ba13101a1302d59ea6e6e0b3cace4ae38/Squirrel/ShipIt-main.m)
uses LaunchServices with an empty launch configuration. Consequently this
updater refuses custom `--user-data-dir`, isolated HOME/VANTA_HOME and explicit
runtime/project/kernel environment overrides rather than silently reopening
another profile. Open the normal installed app before updating such a launch;
manual install remains available. This also prevents a private QA update from
accidentally reopening the owner's normal profile.

[Electron's native updater contract](https://www.electronjs.org/docs/latest/api/auto-updater)
states that a staged update may apply on the next launch even without an
immediate quit. Fresh approval therefore precedes native staging, and ambiguous
outcomes cannot silently unfreeze or retry. We do not assume that newly
documented feed-integrity fields are implemented in the installed Electron;
the local stream independently checks its approved bytes.

## Evidence and gates

- Focused controller, real loopback download/feed, window generation and native
  lease/custody tests exercise denial, busy work, unknown checkpoints, exact
  cancellation, byte substitution and late native outcomes. Tests do not prove
  native macOS replacement.
- Existing renderer update and draft tests remain part of the narrow regression
  set. Source typechecks, size/boundary checks and the paired renderer/native/
  runtime build are required before packaging.
- Executed source checks: 97 focused native/renderer update and composer-draft
  tests passed; two additional cancellation/handoff regressions passed in a
  31-case controller/preparation/window-fence run. Renderer and Electron
  typechecks passed. These do not establish native replacement or restart.
- Corrected attachment/first-launch/composer behavior needs replay against the
  exact signed candidate; see the separately dated defect records.
- Real acceptance still requires two signed packages, fresh native confirmation,
  actual replacement/relaunch into the expected source/version, retained owner
  state and rollback. No owner-profile update is performed without its explicit
  approval. A clean build, mocked updater event or prepared backup does not
  satisfy that gate.
- Final DMG creation, Apple acceptance/stapling, mount/install and public
  download/checksum readback follow those gates. Keep ZIP delivery for updating
  and preserve CLI/kernel Latest. No merge/protection bypass, paid CI/service,
  credential migration, backup deletion or unapproved feedback send is included.

## First actual native acceptance attempt

After explicit owner approval, observed no Working/Needs input chats across
profiles and no live subagents, restored the original view, quit normally and
retained private app/data rollback copies. A signed, Apple Accepted test seed
from source `819a67da` opened the existing owner profile with history intact.
An unsent synthetic draft and local file were added without sending.

The native flow discovered the public signed 0.1.1 target and downloaded its
exact approved ZIP. Renderer/custody/runtime preparation passed. Publisher
verification refused before rollback staging or replacement because `codesign
-R` treats an unprefixed argument as a filename. The literal requirement needed
its `=` expression prefix. The original draft/file remained intact and ordinary
preparation was released. No automatic retry or completed replacement is claimed.

The exact native command passed against that same signed installed app after
the one-character source correction; a focused regression failed before and
passed after it. Failure/check replies now also retain their generated message
in the existing UI contract, preventing the result from overwriting actionable
progress with a generic error. The 0.1.1 target was returned to draft status;
its immutable tag and artifacts remain preserved. Corrected two-package
acceptance must still run before the final DMG.

The next signed 0.1.2 attempt passed publisher verification but refused raw
archive hashing before copying/replacing the app. Under real Electron,
`node:fs/promises.readFile(app.asar)` treats the archive as a virtual directory;
the Node-only publisher check could not reveal that boundary. The raw digest now
uses Electron's built-in `original-fs`, explicitly externalized in the existing
main bundler. Ordinary file operations and global ASAR handling are unchanged.
See [Electron's raw archive guidance](https://www.electronjs.org/docs/latest/tutorial/asar-archives#treating-an-asar-archive-as-a-normal-file).

A zero-window real Electron 43.8.1 helper, not `ELECTRON_RUN_AS_NODE`, reproduced
the exact failure, then retained a publisher-verified private rollback and a
0600 receipt. Source and backup ASAR hashes both matched the actual signed 0.1.2
archive. Ordinary archive reads still refused and `process.noAsar` stayed
unchanged. This is executed backup preservation, not Squirrel replacement.
An additional zero-window Electron ESM run used the production bundler format,
externals and `createRequire` banner: the built-in import resolved, the raw hash
matched and publisher verification passed without a global ASAR toggle.
The 0.1.2 target was also returned to draft status; no app replacement completed
and the owner's synthetic unsent text/file remained retained.

## Successful native replacement and relaunch

The owner authorized a normal-profile update after idle verification and private
app/data backups. The signed/notarized `0.1.0-local.20261117.update3` seed and
normal `0.1.3` target both contain source `b2847a8f`. Fresh exact-release approval,
download integrity, publisher check, renderer/custody/runtime preparation and a
mode0600 rollback receipt passed. The first staging attempt was interrupted by
the computer-use observer reopening the old bundle: LaunchServices identified
that observer as the new process's launcher, and Squirrel correctly refused an
app-still-running replacement. No shutdown or security guard was weakened.

On explicit retry, no computer-use/app-state call was made during installation.
ShipIt recorded successful replacement at 14:55:50 local time and successful
automatic launch at 14:55:54. Only then was native UI observation resumed.
The installed version is `0.1.3`; its ASAR SHA-256 is
`41d95a82d7a2c121b0ee99daf11fccb58eec6b188d38274718d297031d40cdde`.
Its full app fingerprint matches the exact notarized target:
`85516a24e84ea57fd80f1f76353879ec616366760745026f1ea26cd009030797`.
Signature, stapling and Gatekeeper passed again on the installed app. The UI
showed the retained history, synthetic unsent draft/file, ready runtime and
Version & updates `v0.1.3`. The Send circle was visibly intact. The observer's
later cleanup was interrupted by concurrent UI changes; no conversation was
deleted or rewritten. Retention was established before that interaction.

The native rollback contains the previous signed seed and a receipt bound to
the expected new source/version/archive hash. Older normal-app and data backups
remain retained; no credentials or approval grants were migrated. A prepared
rollback was not automatically restored, and this successful update is not a
destructive rollback test.

## Remaining gates

The same normal native path subsequently updated the owner-approved 0.1.3 app
to published **0.1.4 / d4e72e44**, retaining another exact 0.1.3 app rollback and
fresh private data copies. Read-only process/plist observation saw replacement
and automatic relaunch; installed full payload, ASAR, signature, ticket and
Gatekeeper match the public ZIP/manifest. Existing chat history remains visible;
the separate CLI launcher/selection is unchanged. This does not rerun the whole
failure matrix. Final evidence and the separately verified DMG delivery are in the
[0.1.4 release record](releases/desktop-v0.1.4.md).

The signed DMG passed Apple acceptance, stapling, mounted payload identity,
public download/hash and private installed first-launch replay for **0.1.3** after the updater
proof; see the [release record](releases/desktop-v0.1.3.md). A forced native rollback, all offline/native
failure paths, late asynchronous handoff-error presentation, original tester
attachment incident, complete accessibility/parity, whole-product security and
live provider/account/microphone acceptance are not established here. Relevant
source-level failure tests are not substitutes for those native paths.
