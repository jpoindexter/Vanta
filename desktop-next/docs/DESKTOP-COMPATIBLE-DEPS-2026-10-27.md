# Desktop dependency patches and compatible nested resolutions

## Gap first

Security is not green. This source/dependency checkpoint is not yet an installed
Desktop update. Runtime development, website and default-branch alerts are
separate trees and are not cleared by these Desktop patches.

## Exact change

One application lockfile changes: brace-expansion5.0.9→5.0.12 and
source-map-js1.2.1→1.2.2, within existing ranges. Four older minimatch consumers
previously resolved the incompatible root brace5 and threw on benign matching.
Nine scoped nodes supply their compatible brace1/2, balanced1 and exact concat
dependency. Root balanced4.0.4 and every unrelated lock node remain unchanged.
No manifest, override, lifecycle script or forced major upgrade was introduced.

The same11-node closure is installed in canonical Desktop node_modules; former
root package directories and hidden lock are retained externally. Official
tarball integrity was checked in the private candidate before extraction.

## Executed evidence

- All five actual minimatch consumers satisfy their brace ranges and correctly
  include/exclude benign brace patterns. Four were red in the original private
  baseline. Targeted `npm ls` exits0 with no problems.
- Twelve actual package/API checks pass: brace parity, source-map roundtrip,
  bounded malformed offset rejection, CSS-tree source mapping and Mermaid SVG.
  The SVG uses a synthetic DOM with geometry stubs, not native visual proof.
- Fourteen focused Mermaid UI tests pass. Canonical renderer/main/preload build
  and the combined real Electron archive/chat/restart journey pass.
- Exact lock change is82 insertions/6 deletions; unchanged manifests and existing
  node fields are checked against the frozen whitelist. No suppression added.

## Fresh audit and honest comparison

Parent matching-workspace, lock-only production audits on2026-10-27:

| Lock | Critical | High | Moderate | Low | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Exact original | 0 | 7 | 4 | 8 | 19 |
| Integrated repair | 0 | 5 | 4 | 8 | 17 |

Only brace-expansion and source-map-js findings were removed. Cache/Vite and
propagated get-windows/make-fetch-happen/node-gyp findings remain. The worker's
earlier registry response16→14 omitted three propagated rows; that historical
snapshot is not the current parent result or evidence those rows were repaired.
Audit counts are registry findings, not demonstrated exploitation or acceptance.

Raw before/after audits, installed API proof, tree, preimages and rollback:
`Vanta-backups/scoped-integration-20261027-4TCvWX/`. Original candidate and
official metadata: `desktop-two-pin-20261027-lhAb0l`.

Next: separately evaluate compatible cache maintenance and Vite. An advisory
range disappearing without the named behavior changing is not a security fix.
No packaged/native package inspection, live account, full suite or whole-security
acceptance is claimed here. DN-DEP remains open.
