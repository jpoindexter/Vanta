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

Packaging, notarization, extracted-app chat replay, source publication and
GitHub download readback are pending at this source checkpoint. Their executed
results will be appended before handing the replacement download to Iris.
The 11 November test release remains available for rollback; stable `main`
and the normal installed app/CLI are not changed.
