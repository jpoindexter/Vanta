# Dependency security re-entry — 2026-10-25

## Latest loaded-core source checkpoint — 2026-10-27

[Loaded runtime migration](LOADED-CORE-DEPS-SOURCE-2026-10-27.md) supersedes the
shared-dependency limitation below for the canonical runtime: Zod4.6.7 and
OpenAI6.49.0 source plus a separately tested dependency clone are now installed
locally, with previous dependencies/source retained. Parent20 focused SDK/schema
checks, types/startup compile/runtime339 bundle and actual native chat/stream4
pass. Fresh production npm audit0; all-dependency audit9 (2critical/6high/1moderate).
The private profile worker uses a preserved old dependency tree until its final
merge; do not overwrite these35 migrated paths from that older source snapshot.
Installed recovery2 and Desktop/website dependency trees are unchanged. Combined
profile/custody, fresh package/install and broad security/owner gates remain open.

## Latest compatible source checkpoint — 2026-10-27

[Compatible runtime pins](COMPATIBLE-RUNTIME-DEPS-SOURCE-2026-10-27.md) records
adm-zip0.6.1/sharp0.35.5, private installed archive/native proof and production
audit6 to2. Parent reran that behavior and verified the source hashes. The
shared node_modules and installed Desktop remain unchanged: do not treat a
lockfile audit as their installed audit. Coordinate the combined dependency
install with the profile-runtime worker, then verify that exact closure. Zod/
OpenAI, Electron, website/build tooling and broader security remain open.

## Earlier audit and ordering (historical)

Security is not green. These are fresh npm registry/lockfile audit results at
source checkpoint f5b12a97, not exploit demonstrations. Do not sum the trees or
equate these counts with GitHub default-branch alerts. No upgrade is claimed.

| Audited tree | Critical | High | Moderate | Low | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| vanta-ts, production only | 1 | 5 | 2 | 0 | 8 |
| vanta-ts, all dependencies | 3 | 13 | 3 | 0 | 19 |
| desktop-next workspace, all dependencies | 2 | 17 | 6 | 8 | 33 |
| vanta-website, all dependencies | 19 | 14 | 18 | 4 | 55 |

## Reachability before bulk upgrades

The assembled candidate really contains @capacitor/ios 8.5.0, zod 3.25.76,
openai 5.23.2 and nodemailer 10.0.13 in Resources/vanta-runtime/node_modules.
Root-level vitest, tinypool, concurrently and shell-quote are absent there.
That is a top-level package-presence check, not a recursive SBOM or exploit
analysis. Capacitor iOS is shipped unnecessarily for the macOS runtime; no
production TypeScript import was found, but that alone does not prove every
native/mobile path is unreachable. Preserve companion/iOS capabilities.

The workspace Electron binary is 40.10.2; the legacy dependency is ^43.5.1.
The new shell must not receive only npm's suggested 40.10.6 patch and then be
called secure: newer advisory ranges still include it. Electron's own
[certificate mitigation advisory](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9)
requires 42.11.16, 43.8.1, 44.9.1 or a listed patched prerelease. There is no
app-side substitute for that update. Reconcile the two Electron consumers in
one scoped batch, then prove packaged chat/approval/project restart/native
boundaries against the actual new binary. Do not suppress the audit.

## Ordered next security batches

1. Electron alignment at a genuinely patched version, preserving native bridge,
   sandbox, popup and navigation policies. Keep this major-version change
   separate from unrelated package upgrades and retain a rollback package.
2. Patch the shipped runtime dependencies. Capacitor's
   [upstream advisory](https://github.com/ionic-team/capacitor/security/advisories/GHSA-rvm3-566m-v7fv)
   lists iOS 8.5.1 as patched for the installed 8.5.0 line. Nodemailer has a
   compatible patch path. Zod/OpenAI require a deliberate compatibility batch,
   not a forced major override across providers and boundary schemas.
3. Desktop/website build tooling, then remaining transitive dependencies. npm
   marks shell-quote/concurrently critical; the upstream
   [shell-quote advisory](https://github.com/ljharb/shell-quote/security/advisories/GHSA-pqg4-j6r4-53mv)
   labels the issue high and patches it in 1.11.0. Keep the source/severity
   distinction. Do not automatically downgrade Docusaurus just because an
   audit suggestion calls an older version a fix.

For each batch: inspect callers and lock changes; install without global or
account changes; run only relevant provider/build/native proofs; inspect the
resulting shipped closure and re-audit that tree. No audit-fix --force, blanket
allowlist, main merge, CI enabling, release or paid service. Rust/Python and
cross-ecosystem scanning have not been refreshed here. Existing DN-DEP and
canonical trust cards own the work; do not create duplicate cards.
