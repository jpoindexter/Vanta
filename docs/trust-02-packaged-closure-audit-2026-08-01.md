# TRUST-02 Packaged Closure Audit

Date: 2026-08-01

Branch: `codex/trust-02-packaged-receipts-20260801`

Base: `9cd34c3575b4bbac188c69d9d7ec7dd8b44cff1c`

Observed remote `main`: `4911ae44bbb35beef4511ba298475ba5a82b7e1c`

Roadmap state: `TRUST-02` remains `building`

## Verdict

The exact local packaged Darwin ARM64 Done path for the bounded `TRUST-02`
card passes. A signed packaged Desktop app denied unauthenticated local API use,
kept synthetic project and audit secrets out of model-visible tool results,
required a fresh exact decision for the complete hook payload, kept the hook
inactive in the writing process, activated it only after restart, and produced
durable approval, effect-transition, and action-receipt evidence.

This is not a shipment, release, merge, notarization, live-provider, or
cross-platform claim. The roadmap card remains `building` on this unmerged draft
stack.

## Before and after

| Boundary | Before this branch | After this branch |
| --- | --- | --- |
| Protected project reads/writes | A protected refusal from the file-path policy could be treated as an out-of-zone request. Full Access could approve it, exposing `.env` or `.vanta/audit.key`. | Protected project credential and audit refusals are explicitly non-approvable. Full Access cannot convert them into access. |
| Exact control-plane approvals | Fresh exact confirmation reached the operator, but the tool-internal transition was not durably written to `approvals.jsonl`. | Exact confirmation persists `requested` and terminal `approved`, `denied`, or `expired` transitions with an action SHA-256. |
| Denial truth | Several definite file denials omitted an effect disposition and could settle as `unknown`. | Project control-plane, shell-startup, and Git-hook denials carry `effectDisposition: denied`. |
| Desktop authentication proof | The source smoke covered a narrower local boundary. | The packaged smoke denies nine missing-token, wrong-token, and hostile-origin read/mutation routes and verifies trusted renderer access. |
| Packaged restart evidence | No single retained proof exercised hook denial, credential inspection, exact approval, same-run inactivity, process restart, activation, and receipts together. | One packaged proof executes the whole sequence with a local synthetic provider and emits a redacted machine-readable receipt. |

## Exact packaged path

The proof created a disposable project and synthetic values for `.env`,
`.vanta/audit.key`, and `.vanta/events.jsonl`. It then executed:

1. A model-requested `.vanta/hooks.json` write denied through the live Desktop
   approval API. No file was created.
2. Model-requested `read_file` calls for project credentials and audit state,
   plus a `shell_cmd` attempt to read both secrets and overwrite `.env`. No
   synthetic secret reached the model and `.env` remained byte-identical.
3. The same hook payload approved through the live Desktop API. The approval
   description included the exact byte count and payload SHA-256.
4. A normal file write in the same process. The newly written hook did not run.
5. A packaged app shutdown and restart against the same project, followed by a
   normal file write. The hook ran only after restart.
6. Parsing of `tool-effects.jsonl`, `action-receipts.jsonl`, and
   `approvals.jsonl` before disposal. Every required tool call had pending and
   settled evidence, and neither synthetic secret appeared in the evidence.

Observed receipt totals:

| Field | Value |
| --- | ---: |
| Hostile Desktop requests denied | 9 |
| Synthetic secret exposures | 0 |
| Synthetic secret mutations | 0 |
| Exact approval transitions | 4 |
| Same-run hook activation | 0 |
| Restart hook activation | 1 |
| Required action receipts | 8 |
| Retained tool transitions | 21 |
| Retained action receipts | 8 |

Hook payload SHA-256:
`5ba1867041025c0dcce39a3f16a4d8e45c6de6c21d7bd37ffc0520e965ea4214`.

## Verification ledger

| Command | Exit | Observed result | What it does not establish |
| --- | ---: | --- | --- |
| `node --test scripts/lib/trust-02-packaged-proof.node-test.mjs` | 0 | 3/3 proof-helper and malformed-evidence checks passed. | Packaged behavior by itself. |
| Focused writable-zone, file-write, and permission Vitest run | 0 | 85/85 passed. | Electron or restart behavior. |
| `npm run typecheck` | 0 | Runtime TypeScript passed. | Runtime behavior. |
| `npm run desktop:renderer:typecheck` | 0 | Renderer TypeScript passed. | Packaged renderer behavior. |
| `npm run desktop:trust-02:proof` | 0 | Signed package, 9/9 hostile Desktop denials, exact hook/secret/restart proof, and retained receipt checks passed. | Other OSes, notarization, or live external providers. |
| `npm test` | 0 | 1,507 files; 13,909 passed; 3 skipped. | Rust, website, or package signing. |
| `cargo test` | 0 | 70/70 passed; one pre-existing unused-import warning. | Protected Rust changes; none were made. |
| `npm run build` in `vanta-website` | 0 | Optimized production build generated. | Deployment. |
| Semgrep scoped scan | 0 | 0 findings after replacing a harness dynamic regular expression. | Whole-history security review. |
| Gitleaks scoped file scans | 0 | 0 findings with redaction enabled. | Credentials outside the scoped files. |
| `git diff --check` | 0 | No whitespace errors. | Behavioral correctness. |

## Repository and authority boundary

- Root `src/**`, `vanta-ts/src/factory/**`, and `MANIFESTO.md` are unchanged.
- The separate dirty checkout was read only. At the evidence checkpoint it had
  15 status entries with status SHA-256
  `300a0aa01479359b3cee0ca8ba17432c625bb62707022e909991fad507b6bd53`.
- The package reused the verified protected Rust kernel; no Rust source changed.
- The package was signed locally with the existing Developer ID. It was not
  notarized, uploaded, published, deployed, or released.
- GitHub Actions remain disabled and were not invoked.
- No merge, force-push, direct push to `main`, external-account action, or live
  provider effect occurred.

Package evidence:

| Artifact | SHA-256 |
| --- | --- |
| `Vanta.app` `app.asar` | `aee2a72f1cd0afe6d4ae682f047462523beb00bb1e38d1040c4e39fbc71387c7` |
| Embedded kernel | `dbce0757421076e0d2d85e872cdf5dbcca09078fccfb9c5291f15fb4454c0695` |

## Claim ledger

| Claim | Status | Evidence boundary |
| --- | --- | --- |
| Unauthenticated local Desktop/API requests produce no tested host mutation | Executed | Nine packaged hostile requests plus draft readback; not every future route. |
| Project credentials and audit signing state remain outside ordinary model tool reach | Executed | Packaged `read_file` and shell attempts using synthetic secrets; no live credential values. |
| Exact control-plane approval is durable and payload-bound | Executed | Four approval transitions and one hook payload hash in the packaged flow. |
| Hook activation is restart-bounded | Executed | Same-run absence and post-restart activation in the packaged flow. |
| Required effect evidence is retained and secret-free | Executed | 21 tool transitions and eight action receipts parsed before disposal; redacted summary retained in the repository. |
| `TRUST-02` is shipped | Not claimed | Branch is unmerged; cross-platform, live-provider, notarization, publication, and release gates were not run. |

## Retained evidence

- Machine-readable receipt:
  `docs/trust-02-packaged-receipt-2026-08-01.json`
- Human-readable audit:
  `docs/trust-02-packaged-closure-audit-2026-08-01.html`
- Effect inventory:
  `docs/trust-02-effect-inventory-2026-07-31.md`

No new roadmap record was added, and `TRUST-02` was not promoted.
