# Current-source dependency security follow-up — 16 November 2026

This isolated branch extends the delivered Iris source at `064f8cfe`. The
default-branch security backport is a separate candidate; no older source is
overlaid onto this Desktop stack.

## Scope and executed results

| Graph | Full audit before | Full audit after |
| --- | ---: | ---: |
| Runtime (development/build only) | 9 affected-package entries | 0 |
| Website | 29 affected-package entries | 0 |
| Desktop workspace (unchanged) | 0 | 0 |

Raw dated snapshots: [runtime before](proofs/dependency-security-2026-11-16/runtime-before.json),
[runtime after](proofs/dependency-security-2026-11-16/runtime-after.json),
[website before](proofs/dependency-security-2026-11-16/website-before.json),
[website after](proofs/dependency-security-2026-11-16/website-after.json).

- No current agent production source or production dependency identity changes.
  Keep electron-builder 26.15.3, patch its modern matcher consumers using
  version-specific overrides, update rimraf to 6.1.4 and Vite to 6.4.6.
- Website compatible security leaves, scoped query parser/math/worker overrides
  and serializer repair are covered by 17 focused tests. Docusaurus 3.10.2 and
  Mermaid 11.16.1 remain; no new app feature or design changes.
- Runtime typecheck, legacy web build and the two archive/matcher/cleanup checks
  passed. Existing production schema/SDK migrations are preserved, not replayed.

## Verification and limits

- Fresh installation with lifecycle scripts disabled. Runtime installs used
  isolated npm 12.2.2 with `--allow-remote=root` for the already pinned Winnow
  URL; global npm/configuration/authentication were not changed.
- Full installed runtime dependency tree: no reported problems. Version-specific
  Minimatch 9/10 overrides replace inherited parent-context overrides; legacy
  archive/filelist consumers retain their callable 3/5 APIs.
- Archive/executable/link/native-fixture preservation, secret-file exclusions,
  universal-archive matching and exact-target cleanup tests: two passed.
- Website typecheck and full production build passed. Actual built Mermaid
  diagrams and a bundled Mermaid math diagram rendered in clean Chrome with
  no page errors. Mermaid stays 11.16.1 with KaTeX 0.18.2; no unnecessary
  Mermaid-major upgrade. Serializer 7.1.3, Express's scoped qs 6.16.2 and worker
  pool 2.1.2 have focused security/compatibility checks.
- Runtime typecheck and web-renderer build passed. Checks use owned fixtures,
  loopback ports and isolated profiles, not the owner's accounts.
- No audit ignore/allowlist or active advisory dismissal. One obsolete GitHub
  alert (#183) was dismissed as inaccurate only after the primary upstream
  advisory [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)
  confirmed withdrawal at 2026-10-22T19:21:04Z.
- No protected Rust/factory source, policy, credentials, approvals, normal
  launcher selection or installed app changed. Generated outputs are preserved
  in scoped local stashes; previous work, archives and downloads remain intact.

No full application suite, live provider/account, microphone/speech, native
computer control, iOS device, Windows/Linux packaging, deployment or
unfamiliar-user acceptance was run. Audit zero is scoped to the dated dependency
graphs, not whole-product security clearance.

## Why the Iris archive is unchanged

The current Iris source's production package paths, versions, integrity hashes
and resolved URLs match the prior delivery exactly. Its rebuilt legacy web
assets compare byte-for-byte with the extracted delivered app. Vite,
electron-builder, app-builder-lib and rimraf are absent from that app's staged
runtime. The separate Desktop graph was re-audited at zero and is unchanged.

Therefore no customer-facing app/runtime update or notarization is needed for
this build-tool/website-only change on the current branch. Keep the existing
signed/notarized [Iris prerelease](https://github.com/jpoindexter/Vanta/releases/tag/desktop-test-20261112.2),
version `0.1.0-test.20261112.2`, Apple silicon only. ZIP SHA-256 remains
`4c5fa6908b14e8aec4c369c123cf8ddefb13a5468adde9403fc16359002c37b3`.
This does not claim a new application build or a new installed-app check.

## GitHub integration gate

At triage there were 213 open GitHub alerts against the old default branch.
After the one upstream-withdrawn dismissal, 212 active alerts remain. Their
reported vulnerable ranges match no package versions in the repaired main
candidate. This reconciliation and local zero audits do **not** close GitHub
alerts: the protected-main PR still needs one independent approving review,
merge, and a GitHub dependency rescan. Admin enforcement and last-push approval
remain enabled. No merge, force push, protection change or paid CI is performed.
