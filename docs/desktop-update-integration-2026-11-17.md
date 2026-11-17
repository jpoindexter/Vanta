# Desktop update integration — 17 November 2026

Source checkpoint, not yet signed-update acceptance or a new release. The owner
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

## Not claimed

No native two-package acceptance, new installed version, fresh notarized DMG,
original tester incident closure, whole-product security clearance, or live
provider/account/microphone acceptance at this source checkpoint.
