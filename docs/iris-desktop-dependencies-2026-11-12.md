# Iris Desktop dependency repair — 12 November 2026

Scope: the nine affected-package entries in the 11 November Desktop **production**
audit. This does not close every repository or development-tool advisory.

## Changes

- Keep Typography 0.5.20 and override only its selector parser, 6.0.10 → 6.1.5.
  This is the patched 6.x branch; no Typography downgrade or parser major bump.
- Upgrade optional `get-windows` 9.3.0 → 10.0.0. The published API still exposes
  the four active/open-window async/sync functions and permission-suppression
  options. Vanta's staged Windows wrapper now mirrors version 10's `undefined`
  active result and empty open-window array, retaining its strict version guard.
- Regenerate the lockfile. This removes the obsolete optional node-gyp/cache/
  glob/minimatch/proxy chain, including `ip-address`, rather than forcing
  incompatible overrides into it. No direct `ip-address` dependency is added.
- Install Desktop dependencies in a new isolated worktree with `npm ci
  --ignore-scripts`. The existing app, earlier test build, original checkouts,
  shared runtime dependencies, credentials, approvals and backups are preserved.

Primary references: [selector-parser advisory](https://github.com/advisories/GHSA-rj75-hqrm-r3gf),
[Glob advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), and
[`get-windows` 10 release](https://github.com/sindresorhus/get-windows/releases/tag/v10.0.0).
The actual published package entry points, macOS helper arguments and Windows
wrapper were compared before changing Vanta's staging guard.

## Executed source checks

- Same-day before audit: nine moderate production entries.
- Fresh install: 939 packages, lifecycle scripts disabled during installation.
- Installed Desktop production audit: zero vulnerabilities at every severity.
- Agent-runtime production lockfile audit: zero vulnerabilities.
- Targeted dependency tree: expected get-windows 10.0.0 and overridden parser
  6.1.5, no invalid dependency reported.
- Two regression tests: flat selector output/AST, upgraded native staging,
  Windows empty-result behavior without a native binding, preserved macOS
  no-prompt flags, copied executable macOS helper, and rejection of an unreviewed
  future native-package version. Native staging test was red at the old guard
  and green after the narrow wrapper update.
- Desktop renderer/Electron typecheck: exit zero.
- Ten existing microphone-transport fixture tests passed; no recording made.

Raw production audit snapshots: [before](../desktop-next/docs/proofs/iris-dependencies-2026-11-12/production-before.json)
and [after](../desktop-next/docs/proofs/iris-dependencies-2026-11-12/production-after.json).

These tests do not enumerate owner windows, grant OS permissions, or establish
native Windows/Linux acceptance. Microphone transport is tested separately;
no microphone recording or speech-provider acceptance is implied.

## Remaining security scope

Full Desktop audit including development/build tools: 13 affected-package
entries (six high, seven moderate). Those separate findings are not hidden,
reclassified or suppressed by this repair. Production-zero does not mean
whole-bundle or whole-product security clearance. GitHub's old default branch
also remains outside this branch's claim. No policies or approval rules change.

## Build delivery

Download: [12 November repaired Iris build](https://github.com/jpoindexter/Vanta/releases/tag/desktop-test-20261112.1).

- Version: `0.1.0-test.20261112.1`, Apple silicon Mac only.
- Built source: `a5f919402b16cca4e671610ba6a5f7100ee4a198`; the test tag names
  this exact commit, rather than the later delivery-documentation commit.
- Source fingerprint: `03ee02b6eba4236957f786eb77e45e84160744f2c8642a8fa8c21c93df43e08a`.
- The build honestly records `dirty: true` because the tracked legacy web
  renderer was regenerated before packaging. Those were the only uncommitted
  build inputs. Their exact assembly bytes are fingerprinted and preserved in
  the named local build-output stash; no uncommitted agent/Desktop source was
  overlaid. This is not a hermetic-build claim.
- Both renderer builds, runtime bundling, assembly and Developer ID signing:
  exit zero. Unchanged protected kernel binary retained.
- Apple notarization: Accepted, submission `71148f5b-e875-461f-bd88-e2eb6f537836`.
- Stapling, Gatekeeper, deep/strict signature and extracted-archive fingerprint
  checks passed. No macOS security bypass is needed or recommended.
- Final ZIP: `Vanta-0.1.0-test.20261112.1-arm64.zip`, 211,835,800 bytes.
- ZIP SHA-256: `63ec10653b16b549e349b70677f6ff538f523d89a5d569e5aaf0a5979afc82f8`.
- App fingerprint: `c1e21fb1ed250e7c15411e1f3e9187f726df123c19ebfe295a410f999f8938b7`.
- Actual extracted distribution passed new chat → canned local-model reply →
  new empty composer. Zero observed renderer errors; bundled runtime/kernel
  selected without overrides; test profile isolated from owner data.
- Staged-runtime and extracted-renderer secret scans: no findings within the
  scans' scope. No owner credentials or profile are packaged.

The 11 November release, ZIP, checksum and source tag remain available unchanged
for rollback. Its release page points to the replacement. Stable `main`, the
production latest release, and the normal installed app/CLI are not changed.

## Iris install and test

1. Download this release's ZIP and `SHA256SUMS.txt` into one directory. Run
   `shasum -a 256 -c SHA256SUMS.txt` there and require `OK` before opening.
2. Quit an older Vanta before replacing it and retain that app as a rollback.
   Unzip, move `Vanta.app` to Applications, and open normally. Do not bypass a
   Gatekeeper warning. Never run two versions against the same profile.
3. Configure your own provider/model in Tools & connections or Settings.
   Credentials, local models and provider charges are not supplied by this ZIP.
4. Use a disposable project. Send a short chat, open another chat, switch back,
   then quit/reopen and check continuity. Try a low-risk research/document task;
   approve any consequential effect separately, not with broad account access.
5. Report version, macOS/chip, steps, expected/observed behavior and a redacted
   screenshot. Never attach keys, tokens or private documents to a public issue.

No full suite, live account/provider authentication, microphone/speech,
native computer-control, Windows/Linux, or Iris-machine acceptance was run.
