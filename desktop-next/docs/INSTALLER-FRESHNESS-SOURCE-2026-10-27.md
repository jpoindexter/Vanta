# Refuse stale Desktop installation — source checkpoint

## Reproduced delivery defect

The canonical release folder still contains source `f09e827b` from October 22,
while the installed recovery2 app records `71cf90cf`. The previous
`vanta:install -- --no-package` selected that release folder and verified its
signature/identity, but did not compare its source with the requested checkout.
It could therefore replace the installed app with an older valid bundle.

The bounded Done criterion is: the actual installer entry refuses that stale
artifact before backup/replacement or launcher creation, while existing fresh
install, running-app, signature, copy-integrity and rollback checks remain.
This does not mean the new Desktop has been packaged or installed.

## Correction

The entry reads Git identity after packaging. Installation requires the build
report's source commit and candidate path to match, then validates the bundle
identifier, embedded source commit and both version fields against that report.
Missing/malformed expected identity refuses. Existing signed/staged/installed
validation and retained rollback are preserved. There is no force override.

## Executed evidence

Private receipts: `Vanta-backups/installer-freshness-20261027-R2GAh5/`.

- Three new stale/provenance cases failed before the patch. Worker and parent
  each execute the focused installer tests: **20 passed**. They retain ordinary
  successful installation, running-app refusal and failed-install rollback
  using isolated fixtures; they are not real macOS installation acceptance.
- Syntax checks pass. The three production scripts pass strict size analysis.
- Worker invokes real installApp validation with the actual canonical stale
  release and a private destination: expects `f866f522`, refuses `f09e827b`,
  zero native validation calls and no staging/backup. Installed Info.plist and
  ASAR hashes remain unchanged.
- Parent independently invokes the actual `tools/install-vanta.mjs --no-package`
  entry with private destination/bin overrides. It exits 1 with the expected
  source-mismatch error, leaves the destination empty, creates no launcher and
  leaves installed Info.plist/ASAR hashes unchanged. This is real refusal at
  the installer entry, not a traced code path or a real installation.
- Destination scaffolding can create a private empty directory before refusal;
  do not claim literally zero filesystem calls.

## Remaining delivery gates

HEAD identity does not describe uncommitted build-input bytes. Truthful dirty
source provenance and packaging from non-Git snapshots remain separate work.
The distribution ZIP must also be regenerated after the app is stapled; an
earlier archive does not become notarized when only its source app is stapled.
Neither issue is claimed solved here.

Full custody/profile continuity, dependencies/security, candidate integration,
exact signed/notarized package/install/rollback, and owner visual/parity/human
gates remain. No current app is quit or replaced, no signing/keychain/notary
action or upload occurs, no card is closed, and main/releases/tags/CI/paid
services/protected code are unchanged by this checkpoint.
