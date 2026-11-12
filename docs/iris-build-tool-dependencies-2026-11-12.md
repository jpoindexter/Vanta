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

Download: [Iris build-tool-repaired test build](https://github.com/jpoindexter/Vanta/releases/tag/desktop-test-20261112.2).

- Version `0.1.0-test.20261112.2`, Apple silicon Mac only; a prerelease, not a
  replacement for the stable release designation.
- Built source/tag: `6cc545d140bf9cef6f69a1428f0324aea50c21f0` /
  `desktop-test-20261112.2`. Delivery notes are committed separately afterward.
- Source fingerprint:
  `3d7488fdffca66e64f4426416a207313f7a90096702552aae02ac3d2106b1c31`.
- Assembly fingerprint:
  `ddc8cd2e7c9534601a5c35bb76c513d10ec9766de75c73643e778b9ed76d044a`.
- Build records `dirty: true`: only regenerated tracked legacy renderer assets
  were uncommitted build inputs. Those exact assets are retained in a named
  local build-output stash; no uncommitted agent/Desktop source was overlaid.
  Source and assembly fingerprints are recorded, not a hermetic-build claim.
- Both renderer builds, runtime bundling, assembly and Developer ID signing
  passed. Protected kernel input is unchanged (SHA-256
  `0a8511a6d09ef67a05e2eb303234792d5fcb6b0cb5a1209fe3b02a2721017a78`).
- Apple notarization: Accepted, submission
  `8a098f6b-963b-4117-82a7-59c5ebec2a15`.
- Stapling, Gatekeeper, deep/strict signature and final extracted-archive
  fingerprint checks passed. No macOS security bypass is needed or recommended.
- ZIP: `Vanta-0.1.0-test.20261112.2-arm64.zip`, 211,835,684 bytes.
- ZIP SHA-256:
  `4c5fa6908b14e8aec4c369c123cf8ddefb13a5468adde9403fc16359002c37b3`.
- Final app fingerprint:
  `e93c8c05624acdcb14cc35a6273e47c0becd153e191acd3e83c786d10c997de5`.
- Actual app extracted from that final ZIP passed new chat → local-model reply
  → new empty composer, with zero observed renderer errors. Version, bundled
  runtime/kernel selection and isolated user-data path were asserted.
- Staged-runtime and extracted-renderer secret scans: zero findings within
  their configured scope. This is not exhaustive whole-product clearance.

## Iris install and test

1. Download this release's ZIP and `SHA256SUMS.txt` into one directory. Run
   `shasum -a 256 -c SHA256SUMS.txt` there and require `OK` before opening.
2. Quit an older Vanta, retain it for rollback, unzip and move `Vanta.app` to
   Applications. Open normally; do not bypass Gatekeeper or run two versions
   against one profile.
3. Configure your own provider/model. This ZIP does not supply credentials,
   local models or provider charges. Use a disposable project first.
4. Send a chat, open another, switch back, then quit/reopen and check continuity.
   Try a low-risk research/document task; approve consequential effects
   separately. Report version, macOS/chip, steps and a redacted screenshot.
   Never post tokens or private documents in a public issue.

Earlier Iris release archives/checksums remain intact for rollback and their
release descriptions point here. Stable `main`, the production latest release
and normal installed app/CLI are not changed. GitHub reported 214 alerts on its
old default branch during source push; this isolated Desktop repair does not
merge to main or close those broader alerts.

No full suite, live account authentication, microphone/speech, native computer
control, Windows/Linux packaging, or Iris-machine acceptance is implied.
Existing owner installations, runtime selection, credentials, approvals,
private recovery archives and previous Iris releases remain untouched.
