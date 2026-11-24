# Desktop v0.1.0 owner installation — 17 November 2026

The owner explicitly requested installation of the normal release, with a
rollback copy and existing work preserved.

## Executed

- Quit the idle existing app normally; process checks confirmed it stopped.
- Rechecked the public release ZIP SHA-256, candidate signature and notarization
  staple. Installed using the existing staged installer, its signature/root/
  identity checks, and the exact `b12f8af0` declared release provenance.
- Preserved the previous `0.1.0-local.20261029.agent17` app in the installer's
  private rollback directory with a durable receipt. Its signature verifies.
- The installed ASAR SHA-256 is
  `a7709add8f01e653fc18786d9dff2ef8aa2ed8325c794db2c9e98f53e44f8e50`;
  the previous ASAR SHA-256 is
  `950c9dc7bc61305c4943854dafb89faebc6955a808afd670731293e4f4d05272`.
  These are ASAR digests, not whole-bundle or release-ZIP fingerprints.
- Opened the exact `/Applications/Vanta.app`. About visibly reports
  `Version 0.1.0`; embedded build metadata reports `b12f8af0`. The native app
  returned to the same pre-install chat, with existing history visible and its
  runtime status ready. No chat prompt, report or external action was submitted.

The existing CLI selection, credentials, approval state and profiles were not
migrated or reset. No old backup was removed. Recover by quitting the new app
and restoring the retained bundle according to the private install receipt;
never run two bundles on one profile.

## Remaining

This installation check is not a live-provider, every-profile or whole-product
acceptance run. About truthfully still reports updates not configured in this
release. The next source work is the signed updater and attachment-failure
recovery; this document does not claim either is complete.

[Release identity and limits](releases/desktop-v0.1.0.md)
