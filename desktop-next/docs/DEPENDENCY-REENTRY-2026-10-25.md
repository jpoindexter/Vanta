# Dependency security re-entry — 2026-10-25

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
