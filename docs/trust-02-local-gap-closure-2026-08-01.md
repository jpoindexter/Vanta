# TRUST-02 Local Gap Closure

Date: 2026-08-01
Branch: `codex/trust-02-effect-mediation-20260731`
Roadmap state: `TRUST-02` remains `building`

## Outcome

This checkpoint closes the locally actionable visual and packaged-dependency gaps on
the stacked TRUST-02 branch. It does not claim release readiness or shipment.

GitHub Actions are disabled for `jpoindexter/Vanta`; all evidence in this report is
local. No hosted workflow, merge, deployment, notarization, publication, or release
was performed.

## Repository boundary

- The active repository and every tracked change in this checkpoint belong to Vanta.
- Tracked Vanta content contains no reference to the unrelated repository.
- The accidental remote PR in the unrelated repository was closed and its remote
  branch and checkpoint tag were deleted. A local recovery branch/tag remains
  recoverable outside Vanta.
- Root `src/**`, `vanta-ts/src/factory/**`, and `MANIFESTO.md` are unchanged by this
  closure.
- The original dirty Vanta checkout was observed but not modified.

## Visual closure

The desktop shell replacement in the stack intentionally changed the rendered UI,
while the 36 Darwin ARM64 reference captures still represented the previous shell.
The first approval capture therefore failed at `2.912%` against the unchanged
`1.100%` limit.

The reference set was intentionally regenerated, representative approval, work,
recovery, setup, model-picker, and bulk-session states were visually inspected across
themes and viewport sizes, and the exact proof was rerun. No mismatch tolerance or UI
source was changed.

## Dependency closure

The safe lockfile update patches `brace-expansion`. The runtime's optional `winnow`
dependency exposes a local-ML chain through `@huggingface/transformers`,
`onnxruntime-*`, `sharp`, `@img`, `adm-zip`, and `global-agent`; Vanta does not invoke
that optional path.

The desktop package manifest now explicitly excludes that unused chain. A policy test
guards the exclusions, and a real package proof enumerates `app.asar` plus
`app.asar.unpacked` and fails if any excluded package is present.

Current audit interpretation:

- Production dependencies with optional packages excluded: zero vulnerabilities.
- Full production lock graph: five high findings, all in the unused optional local-ML
  chain; no upstream fix is available.
- Website production dependencies: zero vulnerabilities.
- Packaged macOS app: zero forbidden optional-chain entries in the archive and
  unpacked resources.

The package proof locally signed the generated app using the already configured
Developer ID. It did not notarize, upload, publish, deploy, or release the artifact.

## Claim ledger

| Claim | Status | Boundary |
| --- | --- | --- |
| Vanta contains no tracked unrelated-repository material | Executed | Case-insensitive tracked-file search; does not inspect unrelated local recovery refs. |
| Desktop visual proof passes | Executed | 36 local Darwin ARM64 captures at the existing limit; does not establish other OS rendering. |
| Shipped desktop dependency boundary excludes the unused optional chain | Executed | Real local macOS package archive/unpacked enumeration; does not erase findings from the full lock graph. |
| GitHub Actions will not incur Vanta workflow usage | Executed | Repository Actions setting is disabled; does not control a future administrator re-enabling it. |
| Protected source is unchanged | Executed | Git path inventory for this stack; does not approve future protected-source work. |
| `TRUST-02` is shipped | Not claimed | Live external-account, complete packaged real-path, protected-source, and release receipts remain outside this checkpoint. |

## Final local verification

| Command | Exit | Observed result |
| --- | ---: | --- |
| `npm run typecheck` | 0 | Runtime TypeScript boundary passed. |
| `npm run desktop:renderer:typecheck` | 0 | Renderer TypeScript boundary passed. |
| Focused TRUST-02 Vitest command from the read-only workflow specification | 0 | 20 files, 148 tests passed. The hosted workflow was not run. |
| `npm test -- --reporter=dot --maxWorkers=4` | 0 | 1,507 files passed; 13,907 tests passed and 3 skipped. |
| `npm run desktop:local-origin:smoke` | 0 | Untrusted read, navigation, and window actions denied; trusted renderer path passed. |
| `npm run desktop:visual:proof` | 0 | Comparator mutation tests 3/3 and captures 36/36 passed. |
| `npm run desktop:dependency-boundary:proof` | 0 | Policy test passed; archive matches 0; unpacked matches 0; local code signature verified. |
| `npm run build` in `vanta-website` | 0 | Optimized production build generated. |
| `cargo test` | 0 | 70 passed; one pre-existing unused-import warning. |
| `npm audit --omit=dev --omit=optional --audit-level=high` | 0 | Zero shipped production vulnerabilities. |
| `npm audit --omit=dev --audit-level=high` | 1 | Five high findings limited to the excluded optional ML chain; no fix available. |
| Website `npm audit --omit=dev --audit-level=high` | 0 | Zero vulnerabilities. |

The remaining repository, protected-path, secret, static-analysis, whitespace, and
remote-reference checks are recorded on the final commit and draft pull request.

## Remaining gates

The remaining gaps require authority or environments not supplied to this branch:

- live Google/provider/device/payment/telephony/hosted-account receipts;
- complete packaged TRUST-02 real-path receipts beyond the dependency boundary;
- any required changes to the protected Rust kernel, protected factory, or
  `MANIFESTO.md`;
- notarization, publication, deployment, release, merge, or roadmap promotion.

Until those gates are deliberately authorized and executed, `TRUST-02` remains
`building` and the stacked pull request remains draft and unmerged.
