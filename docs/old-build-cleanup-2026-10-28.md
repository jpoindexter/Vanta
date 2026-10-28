# Recoverable old-build cleanup — 2026-10-28

At the owner's explicit request, remove verified unused generated copies before
building again. No source checkout, uncommitted work, installed app, normal CLI
pin, signing material or `/Applications` rollback app is removed.

- Four redundant generated app copies: the canonical agent4 release output,
  one external generated agent3 copy and two external generated agent2 copies.
  Retained versioned installers are independently extracted; complete file/link/
  mode fingerprints and signature checks match before deletion.
- Remove the canonical duplicate agent4 ZIP only after matching the retained
  signed installer hash. Keep that installer and all original delivery receipts.
- Archive and verify 22,194 entries in the ignored packaging scratch before
  removing it. File bytes, symlink targets, modes, source stability and inactivity
  are checked; the exact archive is retained for recovery.
- Six older private dependency/cache trees were separately archived and verified;
  unique experimental dependencies and all proof/source evidence remain.

Private recovery packets: `docs/Vanta-backups/old-build-cleanup-20261028-Y1aUoT`
and `docs/Vanta-backups/generated-recovery-20261028-Uv78Lh`. Removed copies can be
restored to absent targets; never extract over a newer build.

All 239 original work files, 13 dirty legacy CLI files, the launcher and pending
team source hashes match. Installed agent4 and the agent3 rollback fingerprints
match their retained receipts. The older owner-data snapshot lost 25 cache files
between checks; all 32 remaining files are unchanged, and its original 57-file
backup is intact. No current user state is overwritten to recreate old caches.

Free space later reads about 43 GiB. This whole-volume increase is not attributed
entirely to these removals. Cleanup does not itself rebuild, install, release or
verify a newer app; fresh source/delivery checks remain required.
