# TRUST-04 Closure Audit — 2026-08-02

## Verdict

`TRUST-04` is **verified and shipped for the supported local Vanta hosts**. One canonical `WorkItem` / `Run` / `Approval` / `Receipt` contract now governs Desktop, CLI, TUI, messaging, and jobs; memory and goal progress consume the same evidence-derived state. The six representative file, UI, message, calendar, job, and restart paths have executed evidence.

This is not a live-account, cross-platform release, merge, deployment, notarization, or universal gateway claim. GitHub Actions remained disabled.

## Scope and protected boundaries

- Branch: `codex/trust-04-typed-receipts-20260802`
- Stacked base: `codex/trust-02-closure-20260802`
- Verified base SHA: `96e26ced23ab87444ae1b38a51ad6ef8997c90ff`
- Observed `origin/main`: `4911ae44bbb35beef4511ba298475ba5a82b7e1c`
- Protected Rust kernel, `vanta-ts/src/factory/**`, and `MANIFESTO.md`: unchanged
- Other worktrees: clean and unchanged
- No unrelated-project material, live credentials, local `.vanta` state, or generated release artifacts are in the change payload

## Before / after

| Boundary | Before | After | Evidence |
|---|---|---|---|
| Host turn truth | Tool calls had canonical records, but terminal host turns did not share one receipt | Every producer host passes through `createConversation.send()` and persists one content-free turn envelope | `src/agent/turn-receipt.integration.test.ts` executes Desktop, CLI, TUI, messaging, and jobs |
| Effect approval | Shared effect execution did not persist requested/approved/denied/expired authority under the effect WorkItem | Exact effect approvals share the effect WorkItem; timeout remains `expired` | `src/effects/execute-effect.test.ts` |
| Projection names | Continuity exposed host-specific views | Captured, Now, Waiting, Needs You, and Done are derived projections only | `src/work-items/projections.test.ts`, real Electron continuity proof |
| Completion memory | Extractor and learner could accept accomplishment-shaped memory without turn evidence | Only `verified` may persist an accomplishment claim; ordinary preferences remain allowed | `src/work-items/memory-policy.test.ts`, extractor and brain tests |
| Goal progress | Goal status was independent from canonical WorkItem truth | CLI and TUI goal views read the latest linked WorkItem state; a goal marked done without evidence shows `work:unverified` | goal ledger and CLI tests |
| Messaging vs jobs | The shared cron/gateway runner did not identify the terminal host | No wake maps to `messaging`; scheduled/loop wake maps to `jobs` with its goal ID | `src/cli/task-host.test.ts` |
| Calendar authority | Calendar mutations asked internally but did not force fresh approval or preserve denied/expired disposition | Create/update require fresh approval; denial and expiry settle distinctly and never call the provider | tool tests plus real dispatcher integration |
| Job replay | Scheduler effect mediation existed without direct typed-receipt acceptance evidence | Same fire window executes once, persists confirmed/unverified, and replay never invokes the operation again | `src/schedule/effect-run.test.ts` |

## Exact contract

Lifecycle states are exactly:

`draft`, `queued`, `running`, `waiting`, `needs human`, `stopped`, `failed`, `unverified`, `verified`.

Operator projections are exactly:

`Captured`, `Now`, `Waiting`, `Needs You`, `Done`.

Receipt dispositions remain separate from lifecycle state:

`none`, `confirmed`, `denied`, `expired`, `unknown`, `compensated`.

The checked-in host ledger and mutation validator reject missing hosts, altered lifecycle vocabulary, invented projections, collapsed dispositions, or missing evidence paths.

## Representative real paths

| Path | Executed result | What it does not establish |
|---|---|---|
| File | Real Electron launches read `brief.md`, retained its SHA-256, and rejected duplicate execution | No arbitrary external filesystem write authority |
| UI | Three Electron launches rendered continuity, retained exact re-entry after process restart, and reported zero serious accessibility violations | No cross-platform packaged UI claim |
| Message | Synthetic platform sent the canonical final response and native file once through `executeEffect`, with settlement records | No live messaging account delivery |
| Calendar | Real agent dispatcher persisted requested→denied fresh approval plus denied tool/turn receipts; provider mutation count stayed zero | No live Google Calendar mutation or readback |
| Job | Scheduled effect executed once, persisted confirmed/unverified acknowledgement, refused replay, and withheld credentials from a real scheduled child process | No unattended live production schedule |
| Restart | Effect replay after simulated crash became unknown/needs-human without a second operation; Electron and TUI process restarts restored state | No crash proof on every operating system |

## Verification record

| Command | Exit | Observed result |
|---|---:|---|
| `npm run trust:host-ledger` | 0 | 7 hosts, 6 representative paths, 6 mutation classes rejected, roadmap state shipped |
| Final focused TRUST-04 Vitest suite | 0 | 92/92 across 16 suites, including code-size enforcement |
| Whole-suite `timeout 60s npm test` | 124 | Honest timeout; not counted as a pass |
| Isolated hard-ceiling test | 0 | 1 passed in 12.3 seconds |
| First exact-final `npx vitest run --testTimeout=60000` | 1 | 13,963 passed, 3 skipped; one aggregate-load polling timeout in `bg-tasks.test.ts` |
| Isolated `bg-tasks.test.ts` rerun | 0 | 1/1 passed in 116 ms |
| Reviewer counterexample regressions | 2 then 0 | The first review exposed five contract/claim gaps; the second exposed one ordinary-fact memory regression. The repaired memory path passed 35/35 and the full suite passed. |
| Post-review default-worker full diagnostic | 130 (stopped after red) | Exposed a plugin-claim observation race and load-sensitive hard-ceiling timeout |
| Repeated plugin worker plus isolated hard ceiling | 0 / 0 | Plugin suite passed 5 consecutive runs (15 tests); hard ceiling passed alone in 43.46 seconds |
| Final `npx vitest run --testTimeout=60000 --maxWorkers=4` | 0 | 13,975 passed, 3 skipped, 0 failed; 1,519 files in 610.74 seconds |
| Runtime and renderer TypeScript typechecks | 0 / 0 | Both compile without emit |
| `npm run desktop:continuity:proof` | 0 | 3 Electron launches; exact restart re-entry; no duplicate read |
| `npm run tui:restart:proof` | 0 | New process restored prior transcript context |
| `npm --prefix vanta-website run build` | 0 | Optimized production documentation build |
| `cargo test` | 0 | 70 passed; one pre-existing unused-import warning |
| Explicit TypeScript/JavaScript Semgrep packs | 0 | 74 rules, all 43 changed code files, 0 findings |
| `gitleaks git --log-opts=--all --redact` | 0 | 2,973 commits, 75.72 MB, 0 findings |
| `git diff --check` | 0 | No whitespace errors |

## Claim ledger

| Claim | Status | Boundary |
|---|---|---|
| Exact canonical vocabularies | Executed | Source, schemas, projections, validator mutations |
| Five producer hosts persist the same terminal envelope | Executed | Local synthetic providers through the real conversation boundary |
| Memory cannot manufacture nonverified accomplishments | Executed | All eight nonverified states plus extractor/learner paths |
| Unknown consequential effects are not replayed | Executed | Shared executor crash fixture and scheduler fire-window replay |
| Representative paths satisfy local TRUST-04 Done | Executed | File/UI/message/calendar/job/restart evidence above |
| Live external accounts passed | Not claimed | No live account mutation was authorized or required |
| Cross-platform release or deployment passed | Not claimed | No packaging, release, publication, deployment, or notarization occurred |

## Artifacts

- `docs/trust-04-host-ledger-2026-08-02.json`
- `docs/trust-04-closure-receipt-2026-08-02.json`
- `docs/trust-04-closure-audit-2026-08-02.html`
- Host ledger SHA-256: `1f30da12534a48cef86939171aaeae9e1fd5dd6990297212d31b522cf4e66d93`
- Contract SHA-256: `0e1fccc387f9da02abd5f286210e870fcc42f67acbf166d8f812fe4abb0a253a`

## Remaining roadmap order

`TRUST-01` is the next Harness card. `OP-01` is now dependency-ready. Neither is promoted by this audit.
