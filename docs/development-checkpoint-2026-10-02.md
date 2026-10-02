# Application source checkpoint — October 2, 2026

This is a development checkpoint, not a release or a claim that the whole
ambient workflow is finished. The owner explicitly requested that current
application work, tests and notes be saved and pushed, not only documentation.

## Why GitHub looked old

The default branch is still `main`, at
`4911ae44bbb35beef4511ba298475ba5a82b7e1c` (July 21). GitHub's default code
view therefore shows that older history. The work branch is
`codex/desktop-chat-workbench-20261002`, reviewed in
[draft PR #59](https://github.com/jpoindexter/Vanta/pull/59).
Its previous push, `ae2de2ccb72f5d0b6e119aa9ea5900faf7e27418`,
contained documentation and roadmap reconciliation only. The application
implementation was still uncommitted. That publication gap is the purpose of
this checkpoint. Pushing a work branch does not merge it into `main`.

## Included work

- Chat-first workspace, light/dark appearance, conversation and draft ownership,
  visible queued instructions, project context, safe document previews and
  retained advanced capability surfaces.
- Same-workspace full/mini presentation and optional bounded avatar; no automatic
  screen or microphone capture.
- Current provider model discovery, remembered routine approvals, explicit
  fresh-approval boundaries, storage-failure reporting and blocked-turn truth.
- Companion authentication hardening: loopback alone does not grant authority.
- Guarded local app rebuild/install with verification and rollback; no release
  or notarization.
- Cohesive conversation, inventory, model-picker, Classic shell, approval and
  turn-processing modules. Existing UI imports remain available through their
  facades. Kernel assessment still precedes local permission rules, and effect
  persistence still surrounds execution in the original order.
- Source tests, packaged interaction harnesses and retained September/October
  design decisions. Earlier dated results remain historical.

## Executed checks

Commands run from `vanta-ts/` unless stated otherwise.

| Check | Exit | Observed result |
| --- | ---: | --- |
| `npm run typecheck` | 0 | Runtime TypeScript |
| `npm run desktop:renderer:typecheck` | 0 | Renderer TypeScript |
| Focused agent/Desktop/effect/MCP/boundary Vitest run | 0 | 112 files, 678 passed |
| `vitest run src/desktop/desktop-app.test.ts` | 0 | 2 passed after updating module-location and facade assertions |
| `npm test -- --reporter=dot --reporter=json --outputFile=.artifacts/ambient-git-checkpoint-vitest.json` | 0 | 1,589 files; 14,451 passed, 3 skipped |
| Explicit repository size analyzer over changed production source | 0 | 123 files, zero violations; previous integration baseline was 45 violations |
| `node scripts/check-boundaries.mjs` (root) | 0 | All 5 architecture boundaries |
| `cargo test` (root) | 0 | 70 passed |
| `npm run typescript:compat:test` | 0 | 1 passed |
| `npm run desktop:host:test` | 0 | 21 Node tests and 1 tray test passed |
| Roadmap generator tests and current-projection check (root) | 0 | 7 passed; projection matches canonical JSON |
| `bash scripts/secret-scan` (root) | 0 | 2,181 history commits plus current tracked/non-ignored snapshot; zero findings before the new commit |
| Semgrep `p/security-audit --metrics=off --error`, changed source | 0 | 144 files; 22 executed rules, zero findings (225 rules loaded) |
| Protected/forbidden path inventory | 0 | No protected Rust/factory/MANIFESTO, credentials, operator state, upstream checkout or quarantine paths |
| `npm run desktop:rebuild` | 0 | Both typechecks, 7 installer tests, production package, Developer ID signature/deep verification, 51 packaged fixture checks and exact-hash installation with rollback |

The first full run failed one structural test that still looked for components
in the old combined file. The correction checks their new modules and retained
exports; the full rerun above passed. No failing assertion was deleted.

Three existing optional live tests remain unexecuted: real LoRA training and two
speech/Whisper flows. No dependencies were installed or external work initiated
to disguise these skips. This is not an all-integrations-green release claim.
The exact installed archive is
`fb31b7ff1119039a491bdadb88f00438a67d47aa37cc18e0365f7ad8d1ac9539`,
installed at `2026-10-02T17:50:16.408Z`. The previous
`b77ef4a81bfc92711654b2a40eb733d2897f6d64480ff201d09cfde99e55821a`
archive is preserved in the local updater's rollback store. Its machine-readable
receipt identifies the rollback location. Operator data and the CLI checkout
were not replaced.

Packaged proof uses a disposable project, the real local kernel, a synthetic
provider and simulated monitor bounds. It does not prove a normal-profile live
research/computer-control workflow. No renderer errors were reported. Non-Git
fixture stderr still contains repository-probe warnings; those were not hidden
or represented as full workflow acceptance.

## Publication practice

Each coherent change should include its tests and an updated evidence note,
then receive a scoped commit and normal push to the active work branch after
appropriate checks. Confirm the remote SHA after pushing. Do not leave
application changes represented only by a docs commit.

Keep PR status honest: draft source checkpoint is not merged code, installed
binary, public release or complete product acceptance. Do not force-push,
enable Actions, move checkpoint tags or merge simply to refresh a displayed date.
GitHub Actions was checked and remains disabled.

## Still open

- Whole-flow coherence across Connections, background work, decisions, outputs
  and return to the originating conversation.
- Normal-profile current-package research-to-document and bounded native
  observe/action/readback, plus assistive and multi-monitor proof.
- Separate dependency remediation and the stacked-PR integration/review path.
  Dependency security is not green.
- The three optional live tests above and deferred unfamiliar-person acceptance.

No roadmap acceptance status is promoted by this checkpoint. Other checkouts,
operator credentials, unsent drafts and existing tags remain untouched.
