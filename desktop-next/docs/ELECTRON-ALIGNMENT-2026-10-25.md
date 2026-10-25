# Electron alignment — 2026-10-25

## Gap first

Source acceptance only until a matching package is signed, notarized, installed
and exercised. The installed f5b12a97 candidate predates this dependency batch.
Other dependency advisories and the full Desktop/whole-goal gates remain open.

## Change

Both Desktop dependency manifests and lockfiles pin Electron43.8.1, replacing
40.10.2 in desktop-next and43.5.1 in vanta-ts. This is one security/compatibility
batch, not a blanket audit-fix. The upstream
[certificate advisory](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9)
lists43.8.1 as patched; merely40.10.6 would leave newer advisories applicable.

npm hoisted Electron out of apps/desktop/node_modules. The nine affected tools
now share the existing prepared-workspace resolver through a small helper,
using Electron's own executable-path API. Both nested and hoisted installations
are covered; absence fails instead of reaching a foreign checkout. The build
explicitly runs Electron's checksum-verified installer, accounting for the
[postinstall change](https://www.electronjs.org/docs/latest/breaking-changes#behavior-changed-electron-no-longer-downloads-itself-via-postinstall-script).
No permission, popup, media, navigation, kernel or account policy was loosened.

The desktop lock drops55 obsolete dependency entries from the old Electron
closure and adds four hoisted/new-extractor entries. No existing unrelated
package entry changes version. The runtime lock changes only Electron's entry
and its owning version pin. No generated baseline or suppression was added.

## Executed source checks

- Four version-pin/resolution tests pass. The first resolution run exposed
  macOS /var vs /private canonical paths; expected paths now use realpath.
- 115 existing native/security boundary tests across seven files pass, plus
  three startup bridge tests. Unit mocks do not prove OS security enforcement.
- Electron and renderer typechecks exit0. A generic async test stub lost its
  generic signature inside vi.fn; the unasserted mock wrapper was removed,
  preserving the stub and leaving production behavior unchanged.
- Fresh new and classic renderer builds pass; runtime bundle339chunks.
- Real source Electron path passes13steps/seven probes: actual recorded
  Electron43.8.1, Node24.22.0, packaged=false. Saved approval/restart/new chat,
  different-project isolation, Plan/irreversible boundaries, image and200KB
  paste and three viewport sizes pass. One browser vibration warning, no
  runtime exception reported.
- Legacy dependency binary separately prints v43.8.1; a complete classic
  renderer interactive acceptance was not run.
- Eleven changed non-test build/proof scripts have four existing size findings,
  none new/worse versus their pre-edit contents. All changed scripts pass
  syntax checks; five architecture boundaries and current brand/design scans
  pass (all five design categories zero). No baseline was regenerated.
- Fresh audits no longer report Electron in either tree: desktop33→31 total
  (2critical/15high/6moderate/8low), runtime19→18
  (3critical/12high/3moderate). Other advisories remain, not accepted away.

The scripted model is local, folder selection is stubbed, and the existing
automation harness uses --no-sandbox. This does NOT certify the production OS
sandbox, real accounts, hardware microphone, VoiceOver or complete parity.

## Next

Publish/back up this scoped source checkpoint, package from those exact inputs,
sign/notarize, preserve the current app, install without interrupting work and
execute the same criterion against that exact installed binary. Then continue
shipped runtime patches and the existing trust/modularization cards. No main
merge, PR reopening, release/tag, paid/CI or owner-gate bypass.
