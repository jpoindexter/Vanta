# Compatible runtime dependencies — source pins, not an app delivery

Only two existing override pins change: `adm-zip` 0.6.0 to 0.6.1 and `sharp`
0.35.3 to 0.35.5. The lockfile changes exactly those packages plus 26 sharp
platform/libvips family entries. No unrelated dependency drift, feature removal,
new override family, audit suppression or forced major upgrade.

## Executed proof

Private candidate and raw receipts:
`Vanta-backups/dependency-compatible-20261027-fnnqj6/`.
Its genuinely separate dependency tree was installed without lifecycle scripts;
it is not a symlink into the shared checkout.

- Fresh private production audit: **six to two package findings**. Before:
  zero critical/five high/one moderate. After: zero critical/two high. OpenAI
  and Zod remain. This is neither a complete ecosystem audit nor GitHub's
  default-branch alert count.
- Actual bounded malformed-ZIP fixture: the old dependency crashes its child
  process; the patched version reports an error callback without a crash.
  Valid synchronous/asynchronous archive round-trips pass.
- Native sharp loads on arm64 macOS and converts/resizes SVG to a PNG with
  the expected dimensions. This is not a Linux/glibc exploit reproduction.
- Worker compression checks: **56 passed/three files**; package policy:
  **two passed**; runtime typecheck and 339-chunk bundle build pass.
- Parent independently reran the four archive/native behavior checks against
  the private installed tree and verified both source preimages/candidate
  hashes before integration. Parent's canonical lockfile audit reports two
  high findings (exit 1, correctly non-green).
- The worker's first after-check failed only in its version reporter because
  sharp does not export package.json; it now uses sharp.versions.sharp. The
  failed report is preserved. No behavior assertion was removed.

## Delivery and residual boundary

The shared checkout's existing node_modules is deliberately not reinstalled
while another isolated runtime candidate reads it through dependency symlinks.
Therefore the two source pins and private installed proof do **not** establish
that the current CLI dependency tree or installed Desktop was updated. Reinstall
and recheck the exact combined closure before claiming that delivery.

The installed macOS top-level closure excludes both optional ML dependency
chains; no packaging exclusion changed. This improves the full CLI/local-ML
install, not the installed app's loaded Zod/OpenAI/Electron security. Loaded-core
major migration, Electron alignment, website/build tooling and all wider trust
gates remain. No card is closed and dependency security is not green.

Primary patch references:
[adm-zip advisory](https://github.com/cthackers/adm-zip/security/advisories/GHSA-8238-w5pm-2374)
and [sharp advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w).
No main merge, tag/release, CI/paid change, protected-source edit, owner state
mutation or installed-app replacement occurs in this source checkpoint.
