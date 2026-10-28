# Startup-cache generation checkpoint — 2026-10-28

**Source checkpoint; installed agent6 and the selected normal CLI are unchanged.**
This advances agent reliability, not a Desktop visual or whole-product sign-off.

## Observed cause and repair

The previous publisher renamed the shared cache away, replaced it in a second
operation, then deleted the old output. It also reused a PID-named staging folder
and recorded source metadata only after compilation. A real ESM regression showed
that an already-loaded entry could import a later module from the replacement
build. Separate regressions showed concurrent builders colliding and edits made
during compilation being accepted as current.

Each successful compilation now returns a unique directory inside `.startup-cache`.
Only its small `current.json` pointer is atomically replaced. The launcher captures
that exact directory; subsequent launches cannot replace its dynamic imports.
Before/after source metadata must agree before publication. Failed builds remove
only their own unpublished directory and retain prior generations. Exit 75 selects
a fresh generation, preserving the existing source-loader fallback on build failure.

Legacy cache files are not moved or deleted. Running old launchers therefore keep
their files during adoption. Published generations are intentionally retained:
this change does not implement automatic garbage collection or prove a process
has stopped using an old generation. Storage grows after source rebuilds; cleanup
must establish inactivity rather than deleting a live reader's imports.

## Executed evidence

Private packet: `Vanta-backups/startup-cache-race-20261028-StJ433`.

- Before repair: five existing tests pass; three new regressions fail for mixed
  imports, false source certification and concurrent staging collisions.
- After repair: eleven focused Node tests pass, including an actual ESM reader
  remaining usable in the legacy cache layout. Two drive the actual shell launcher
  through exit 75/path spaces and a compiler-error source-loader fallback using a
  copy-only compiler fixture; these are not real TUI restart/native-compiler proofs.
- An isolated source copy runs the actual native compiler and actual `run.sh`.
  Cold/warm ACP initialization passes. Three concurrent rebuild launches initialize
  successfully and exit naturally with empty stderr; process inspection confirms
  three distinct generation paths, not silent fallback to the source loader.
- The actual compiled CLI, ACP/MCP clients and unchanged Rust kernel pass 26 checks:
  ordinary read/write with a fresh fixture approval, exact draft bytes, explicit
  overwrite denial and denied receipt, protocol-only output, MCP errors, cancellation
  and warm-cache reuse. Only the external model is a private scripted fixture.
- Runtime typecheck, shell syntax, strict changed-code size and diff whitespace
  checks pass. No full application suite is inferred from these focused checks.

The first three ordinary concurrent **pre-repair** launches also passed. The
earlier missing `company-runs.js` crash was not reproduced by timing alone; these
deterministic regressions establish cache defects, not forensic certainty about
that historical run. An initial launcher-test fixture had a string-escaping error;
correcting that fixture preceded its passing execution, without a production bypass.

## Remaining boundaries

The cache uses source metadata rather than content hashes and checks its entry
and two required runtime helpers, not an integrity manifest of every emitted file.
Coherent retained generations address replacement races, not arbitrary corruption
or a hostile local cache writer. No credential, approval, policy, protected Rust,
factory, installed app, normal CLI selection, owner profile or account is changed.

No new app packaging/notarization/install, real TUI `/restart`, owner-account run,
full parity, unfamiliar-person acceptance, main merge, public release/tag, CI or
paid service is claimed. Keep the broad Trust/Operator and cutover gates open.
