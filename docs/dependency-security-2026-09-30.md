# Dependency security remediation — 2026-09-30

## Boundary

This is a security-only branch from default-branch commit
`4911ae44bbb35beef4511ba298475ba5a82b7e1c`, not a merge of the newer feature stack.
GitHub reported 115 open Dependabot alerts: 66 high, 44 medium, and 5 low.
Each alert's package, manifest and vulnerable semver range was compared against
every matching package location in the repaired lockfiles: **115 checked, zero
remaining matches**. No alert was dismissed or suppressed.

Live npm audit also found newer advisories not yet represented in those alerts.
Before repair, npm reported 19 vulnerable package nodes in Vanta (16 high, 3
moderate) and 20 in the website (11 high, 9 moderate). These node counts are not
the same measurement as GitHub's advisory/manifest alert count.

GitHub Actions remain disabled. No merge, release, notarization, deployment,
installation, protected-source change, or rewrite of published history is part
of this work. Existing feature branches and the installed app require separate
integration and validation; this older default-branch snapshot must not replace
them directly.

## Changes

| Direct dependency | Before | After |
| --- | --- | --- |
| Electron | 43.1.0 | 43.7.7 |
| Vitest | 3.2.6 | 4.1.11 |
| Nodemailer | 9.0.1 | 10.0.13 |
| ImapFlow | 1.4.2 | 1.7.8 |
| PDF.js | 6.0.227 | 6.3.289 |

Compatible lockfile repairs cover XML, ZIP, image processing, HTTP, YAML, CSS,
SVG, diagram rendering, browser tooling and their transitive dependencies.
The website explicitly overrides `lodash-es` to 4.18.1 because pinned transitive
versions in Chevrotain otherwise retained two advisories. No blanket
`npm audit fix --force` was used. npm 10 crashed resolving Vitest's peer graph;
npm 12.1.0 generated the repaired runtime lock, subsequently installed with the
normal npm 10.9.8 `npm ci` path.

The patched Vitest version required explicit callable mock types in two tests.
Two inherited test-isolation defects were corrected: the Termux fixture now
owns its VANTA_HOME, and the use-case catalog reads its existing quote-free
checked-in index instead of requiring a private external checkout. No external
agent source or checkout was added.

A real PDF test exposed a Buffer/plain-Uint8Array mismatch masked by the old
mocked tests. The extractor now supplies a separately owned Uint8Array. This is
the sole application behavior change. A real loopback SMTP fixture exercises
Vanta's actual mail transport with the upgraded library; it sends no external mail.

## Executed gates

Commands below run from `vanta-ts/` unless stated otherwise. All are local.
The live-kernel tests used a separately built kernel on port 17849, rooted in
this isolated worktree, with test state under an ignored temporary directory.

| Gate / command | Exit | Observed result |
| --- | --- | --- |
| `npm ci` | 0 | Repaired Vanta lock installed; zero audit findings |
| `npm ci` in `vanta-website/` | 0 | Website installed; zero audit findings |
| `node scripts/dependency-security-check.mjs` at root | 0 | All three lockfiles, all severities: zero |
| `node --test scripts/dependency-security-check.test.mjs` at root | 0 | 7 fail-closed audit-gate tests |
| `npm run typecheck` | 0 | Runtime and tests typecheck |
| `npm run desktop:renderer:typecheck` | 0 | Renderer typecheck |
| `npm run typecheck` in website | 0 | Website typecheck |
| `vitest run src/gateway/platforms/email.test.ts src/desktop src/tools/read-file.test.ts src/browser` | 0 | 38 files, 216 tests |
| Focused agent, Termux, catalog, projects and goal-condition tests | 0 | 5 files, 38 tests; real isolated kernel |
| `vitest run src/gateway/platforms/email-transport.integration.test.ts src/tools/pdf-read.test.ts` | 0 | 17 tests including actual SMTP transport and PDF parser |
| `VANTA_KERNEL_URL=http://127.0.0.1:17849 VANTA_HOME="$PWD/.artifacts/dependency-security/test-home" npm test -- --maxWorkers=8` | 0 | 1,459 files; 13,618 passed, 3 skipped |
| `npm run desktop:build` | 0 | Production renderer built |
| `npm run build` in website | 0 | Production site built |
| Headless browser against local built website | 0 | HTTP 200, expected heading, zero page errors |
| `cargo test` at root | 0 | 70 passed |
| `node --import tsx src/cli.ts lint src/tools/pdf-read.ts` | 0 | Size limits satisfied |
| `node --import tsx src/arch/cli.ts` | 0 | Five architecture boundaries hold |
| Semgrep `p/typescript` over changed production code and audit command | 0 | 74 rules, two targets, zero findings |
| `gitleaks git . --config .gitleaks.toml --redact --no-banner` at root | 0 | 2,179 reachable commits, zero findings |
| Gitleaks over tracked and non-ignored untracked snapshot | 0 | Zero findings; ignored dependencies, local state and build output excluded |
| Protected-path diff (`src/`, factory, `MANIFESTO.md`) | 0 | Empty |
| `node scripts/desktop-local-origin-security-smoke.mjs` | 0 | Electron 43.7.7 source app: trusted renderer passed, untrusted read/navigation/window denied |
| `npm run desktop:kernel` and `CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --mac dir --arm64 --publish never` | 0 | Local unsigned macOS arm64 candidate built; not installed or published |
| `VANTA_DESKTOP_APP="$PWD/release/mac-arm64/Vanta.app/Contents/MacOS/Vanta" VANTA_DESKTOP_SMOKE_PORT=17852 node scripts/desktop-local-origin-security-smoke.mjs` | 0 | Packaged app: launch boundary, trusted renderer, untrusted read/navigation/window checks all passed |
| `git diff --check` | 0 | No whitespace errors |

Initial failures are retained as diagnostic evidence, not omitted: npm's peer
resolver crash, two mock type errors, three test failures plus a missing-reference
suite, and the real PDF parse failure all preceded the successful reruns above.
The test suite's three skips remain skips, not acceptance evidence.

## Lockfile identities (SHA-256)

```text
vanta-ts/package-lock.json
5e514811f814f035e3dd27a9750111e89b15a0f6fbf1ce7fe86fa7066f0f2c1a
vanta-website/package-lock.json
f20f90c203ac2dd28ea05a26fa784ae69c86d6a02014e15b8cb5b25f340f6193
vanta-ts/packages/sdk/package-lock.json (unchanged)
0080677cec304180639a9ae7d08986ff785de2aeb14d9c6c59210f3852412b5d
Local candidate app.asar (unsigned; not distributed)
eb407fdee4b369982a7dc1d579f360779f65608cad1194f5773c7231ae858037
Private 115-alert reconciliation report
f867ad1685247ba2a9dd76d8118d2f8327863edf6b66dd13512f3a7be1726e80
```

## Remaining boundaries

- Default-branch alerts do not close until an authorized merge and GitHub rescan.
- The current installed feature stack and existing releases are unchanged.
- No live mailbox, model-provider, participant or external-account test was run.
- Package deprecation warnings remain distinct from audited vulnerabilities.
- Zero known findings is a dated audit result, not a claim of perfect security.
- Existing Dependabot PRs remain open; this branch does not close or merge them.
