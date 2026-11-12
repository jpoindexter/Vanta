# Iris Desktop build-tool repair — 12 November 2026

Scope: the 13 remaining affected-package entries in the Desktop development and
build dependency graph. This extends the earlier production-only repair; it is
not a claim about the old default branch or every Vanta dependency graph.

## Changes and compatibility

- Update xmldom to 0.8.15, Axios to 1.21.1, fast-uri to 3.1.9,
  follow-redirects to 1.16.3, Joi to 18.3.2 and Undici's affected 6.x/7.x
  branches to 6.29.1/7.30.2 through the lockfile.
- Scope Glob 14.0.5 and Minimatch 11.0.8 to the modern archive/build consumers.
  Keep legacy archive, Glob and filelist matchers on their compatible APIs.
  A blanket matcher-major override broke filelist's callable API during proof;
  the final graph explicitly retains its 5.x matcher and Glob 7's 3.x matcher.
- Keep direct Desktop package versions, including Electron, electron-builder
  and React, unchanged. Pin existing React 19.2.7/types 19.2.17 at the workspace
  boundary to avoid duplicate, incompatible peer types from lock regeneration.
- No audit suppression, ignored advisory, forced install, policy change, new
  runtime feature, or protected kernel modification.

Primary patch references: [Minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249),
[Glob release](https://github.com/isaacs/node-glob/releases/tag/v14.0.2), and
[xmldom advisory](https://github.com/advisories/GHSA-965w-775f-mr7g).

## Executed source proof

- Same-day full Desktop audit: **13 → 0** (six high, seven moderate before).
  Production Desktop audit remains **zero**. Raw snapshots are in
  `desktop-next/docs/proofs/iris-build-tools-2026-11-12/`.
- Fresh npm 10.9.8 `ci --ignore-scripts`: exit zero, 991 packages installed.
- npm 12.2.2 targeted dependency-tree inspection: exit zero, no problems.
  npm 10's older tree reporter still calls the scoped major overrides invalid;
  do not mistake that output for a passing npm 10 tree check.
- Six focused security/compatibility tests passed: modern and legacy archive
  round trips preserve dotfiles, links, executable mode and unpacked fixture
  bytes; builder excludes secrets; legacy matcher stays callable; plist and
  referenced JSON schemas validate; readiness redirects and Undici 6/7 work
  against an owned loopback server.
- Renderer and Electron typecheck, legacy web renderer build, and ten existing
  voice-transport fixture tests: passed. No microphone recording was made.

The pinned npm 10 resolver crashed while updating this graph (`edgesOut` in
Arborist). Lock maintenance used isolated npm 12.2.2 via `npm exec`; global npm,
Node, authentication and owner profiles were not changed. Future lock maintenance
and overridden-tree inspection should use that same isolated npm invocation.
The lock regeneration also updates/relocates transitive build dependencies;
it is not an assertion that every unrelated lockfile node is unchanged.

## Delivery

Signed/notarized archive and extracted-app proof will be recorded here after
they execute. Source checks alone do not establish a usable download.

No full suite, live account authentication, microphone/speech, native computer
control, Windows/Linux packaging, or Iris-machine acceptance is implied.
Existing owner installations, runtime selection, credentials, approvals,
private recovery archives and previous Iris releases remain untouched.
