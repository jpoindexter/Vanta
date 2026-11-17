# Same-commit package freshness — source checkpoint

## Verdict

The actual install CLI now captures current declared-source provenance itself
and requires the package report and embedded receipt to match that full commit
and source digest. Changing source without committing no longer leaves
`--no-package` eligible to install the older package. This closes the bounded
same-HEAD freshness gap; it does not deliver or accept a new Desktop build.

## Scope

- `install-vanta.mjs` has no expected-source override and always calls
  `captureSource()` after any packaging step.
- `install-app.mjs` performs the source-only preflight before process probes,
  signature tools, staging or replacement. Existing destination/path checks
  may create an empty destination directory; no replacement is implied.
- `build-identity.mjs` compares current full commit/source digest, report
  provenance and exact embedded build. Existing bundle ID/version/commit and
  signature/integrity/rollback checks remain in place.
- Historical standalone/notary helpers may omit `expectedSource`; the actual
  install CLI never does. This preserves historical archive validation, not an
  alternate CLI bypass. The declared-input fingerprint remains non-hermetic.

## Parent-executed proof

```sh
node --test desktop-next/tools/packaging/install-source-digest.test.mjs desktop-next/tools/packaging/install-app.test.mjs desktop-next/tools/packaging/delivery-archive.test.mjs
```

**32 passed, zero failed**, approximately 2.35 seconds: existing installer
regressions, six new digest checks and notarization compatibility. Actual CLI
entry fixtures use mocked Git/process/plist/signature tools and disposable
tiny applications; real copying/rollback helpers run only on those fixtures.
Same-commit source changes, absent provenance and embedded/report mismatches
refuse before any process/signature/copy commands. Matching fixture installation
preserves its previous fake app. These are not real signing or installation.

The parent additionally ran the actual canonical `--no-package` command with
private destination/launcher paths against the old canonical release artifact.
It exited 1 with “The packaged app does not match the expected source. Rebuild
Vanta before installing.” The private destination remained empty, no launcher
directory was created, and no real app was replaced. This real old-commit
refusal complements, but does not replace, the same-HEAD fixture proof.

Three production MJS files pass the existing strict size analyzer with zero
findings. All four source postimages match the frozen patch. The original
239-file preservation manifest remains the required separate custody check.

## Backups and remaining work

Private packet:
`/Users/jasonpoindexter/Documents/GitHub/docs/Vanta-backups/install-source-digest-20261027-ZXteHl`.

Four-file frozen patch SHA256:
`d2e6fd82c22109f28e1f9554c445c29808d4eda91a6275c8bd3ef31e062797d1`.
The parent verified the three existing preimages, checked the new test path
absent and copied preimages before application. Earlier frozen packets remain
untouched. The installed app, owner data and shared dependencies are unchanged.

Still required: integrate profile/custody and loaded-core dependency work,
build/sign/notarize a fresh candidate, validate its final archive, install with
rollback and exercise that exact installed build. No visual/parity/human or
live-account acceptance is inferred. No status/Done/main/release/tag/CI/paid
change or legacy removal is authorized by this checkpoint.
