# Recoverable Desktop installation — 2026-10-25

## Reproduced risk and scope

The new Desktop installApp removed the existing target before copying and its
CLI falsely said /Applications/Vanta.app stayed unchanged. That helper was NOT
used for today's owner installation: it used guarded staging and retained the
actual previous app. This repair reuses the existing installLocalDesktop /
hasRunningDesktop helpers, not another replacement framework.

The new adapter validates absolute, separate, regular Vanta.app bundles with
studio.theft.vanta-next identity; rejects source/target/rollback symlinks and
destinations inside any app bundle, including symlink aliases and nonexistent
children. Shared transaction validates target symlinks before replacement.
Running app/helpers are refused, including a second check after staging.
Candidate/stage/installed codesign and ASAR hashes are checked; prior app and
receipt retained; failed installed verification restores it and retains the
rejected candidate. No quit, recursive target deletion or profile change.

installApp is now async and returns the receipt. Its sole production caller
awaits it and prints target/backup/receipt BEFORE attempting launcher update,
so an unmanaged launcher refusal cannot hide successful app replacement.
Launcher paths quote apostrophes and shell syntax as literal data.

## Executed criterion

- 23 temporary-fixture tests pass: 16 installer/launcher and seven existing
  transaction tests. Includes running/staging races, wrong identity, invalid
  staged signature/hash, post-rename rollback, symlink/overlap/app-ancestor
  refusal, first install, unchanged unrelated content and literal shell paths.
- Syntax/scoped diff pass. Both changed production scripts have zero AST
  size/complexity findings; no baseline reset or relaxed rules.
- Actual final installApp API run with real signed apps, real plutil/codesign,
  ditto/staging/rename/hash/receipt checks, in private isolated Applications:
  old f94c5025 hash12a129… retained; new745629c6 hash38d842… installed; rollback
  and receipt both exist. Full hashes/path in
  `proofs/installer-recovery-2026-10-25/receipt.json`.
  Owner /Applications/Vanta.app and user profile were not touched by this proof.

## Limits / delivery identity

This verifies the public installer API, not another owner CLI replacement.
Codesign validation does not itself require Developer ID/notarization/Gatekeeper;
today's delivered app separately passed all of those gates. Custom app identity
variants are explicitly unsupported. Existing transaction has no simultaneous-
installer lock or crash-atomic recovery guarantee; do not claim either.

These are repository install tools, not shipped renderer/native runtime code.
Installed app remains the accepted745629c6; no rebuild was necessary for these
outside-the-bundle tooling changes. PARALLEL-DELIVERY-2026-10-25.md records the
installed13-step/seven-probe and27-Find acceptance. Full goal remains active.
