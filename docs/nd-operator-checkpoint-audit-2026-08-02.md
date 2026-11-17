# Neurodivergent Operator Checkpoint Audit

Date: 2026-08-02

Branch: `codex/desktop-project-switch-and-bulk-20260802`

Baseline: `9d72e5c26e278e2fc2a9de0c05cc3811a59ef7f4`

Audit state: local checkpoint verified; dependency advisories disclosed

## Verdict first

`UX-03` has executed end-to-end evidence for the bounded local/read-only
continuity wedge, its final local gate passes, and it is now `shipped`. The
other three engineering cards are not being promoted:

- `TRUST-04` remains `next` after `TRUST-02` because representative file, UI,
  message, calendar, job, and restart paths do not yet share one completed
  typed receipt contract.
- `TRUST-01` remains `next` after `TRUST-02`. The current TypeScript
  `executeEffect` callsites now have a complete machine-checked ledger, but the
  ordinary tool dispatcher and all Calendar/Drive life-mutation guarantees are
  not yet proven through one gateway.
- `OP-01` remains `next` after `TRUST-04`. The minimum spine and read-only
  reconciliation are present, but no legacy writer cutover, dual-write,
  rollback, or retirement is authorized or claimed.

`GROW-01` paid co-design and live participant evidence are explicitly deferred.

## Before and after

| Boundary | Before this checkpoint | After this checkpoint |
| --- | --- | --- |
| Messy capture | No canonical continuity capture from the Desktop operator surface. | A local item can be captured without category or priority; an `@file` mention binds the exact safe project file. |
| Today | The existing Operate destination exposed run-oriented machinery. | The same destination presents one Today recommendation with exactly three primary choices: **Do it**, **Show me**, and **Snooze**. |
| Prepared action | No bounded continuation path joined source, capacity, action, and receipt truth. | A ten-minute, reversible local read prepares and executes once through persisted WorkItem, Run, Approval, and Receipt records. |
| Restart re-entry | No executed proof returned to the exact last verified continuity state after a process restart. | Three real Electron launches retain one waiting item, its evidence, and one exact re-entry action without replaying the effect. |
| Capacity and refusal | The ND profile did not expose all seven capacity dimensions or the complete refusal scope on this surface. | Cognitive, attentional, sensory, social, emotional, physical, and time capacity can remain unknown; transient values expire; session, pattern, and global Off scopes are explicit. |
| Legacy stores | Tickets, schedules, effect work items, runs, and sessions had no shared read-only continuity projection. | Legacy records retain source IDs, counts, and hashes in a read-only projection; corrupt bytes remain visible and unchanged. |
| Effect inventory | TRUST-01 inventory prose could drift from production TypeScript callsites. | A checked-in JSON ledger and mutation-tested validator cover all 14 production `executeEffect` source files and 24 effect kinds with zero missing or stale source entries. |

## Executed UX-03 path

The retained source-Electron proof used an isolated temporary project and
profile. It executed the real Desktop continuity UI across three launches:

1. Captured `@brief.md` without taxonomy.
2. Rendered one recommendation and the three primary choices.
3. Opened **Show me** and exposed the concrete action, source, duration, and
   reversibility before execution.
4. Selected **Do it**, persisted the pending/running/approved/verified path,
   read the exact local file once, and retained a receipt without source bytes.
5. Closed the process, relaunched it, and restored one exact re-entry action.
6. Confirmed replay returned the retained receipt and did not repeat the read.
7. Expired a transient low-capacity value to `unknown` while preserving stored
   history.
8. Confirmed session Off reset after restart and pattern/global Off persisted
   in focused server tests.
9. Settled Snooze and Skip independently from lifecycle state.
10. Confirmed the source file remained byte-identical and the Today surface had
    zero serious axe violations.

Observed proof summary:

| Field | Value |
| --- | ---: |
| Real Electron launches | 3 |
| Recommendations shown | 1 |
| Primary choices | 3 |
| Prepared reads executed | 1 |
| Duplicate reads | 0 |
| Runs retained | 3 |
| Approvals retained | 1 |
| Receipts retained | 3 |
| Legacy sources reconciled | 5 |
| Serious axe violations | 0 |

## Four-lane disposition

| Roadmap card | State | Current evidence | Remaining real Done gap |
| --- | --- | --- | --- |
| `UX-03` | `shipped` | Executed Desktop capture, prepare, run, restart, refusal, expiry, recovery, and accessibility path. | No gap inside the bounded local/read-only card contract. Consequential authority remains outside this card. |
| `TRUST-04` | `next` | Exact nine-state types and typed Run/Approval/Receipt records are used by continuity. | Wait for `TRUST-02`; then prove the same truth contract across representative file, UI, message, calendar, job, and restart hosts. |
| `TRUST-01` | `next` | Machine ledger covers 14 `executeEffect` sources and 24 effect kinds; Gmail header and separate Google-scope tests are in the focused matrix. | Wait for `TRUST-02`; eliminate the older ordinary-tool policy boundary and prove Calendar/Drive preconditions, idempotency, immutable IDs, readback, and compensation. |
| `OP-01` | `next` | Continuity records the minimum spine and preserves five legacy sources through ID/count/hash reconciliation. | Wait for `TRUST-04`; prove bounded dual-write, rollback, cutover, and retirement before changing a legacy writer. |

## Verification ledger

| Command | Exit | Observed result | What it does not establish |
| --- | ---: | --- | --- |
| `npm run desktop:continuity:proof` | 0 | Three real Electron launches; one prepared read; restart re-entry; refusal reset; expiry; snooze/skip; source unchanged; zero serious axe violations. | Packaged distribution, consequential external effects, or another OS. |
| Focused continuity/trust/operator Vitest matrix | 0 | 28 files and 256 tests passed. | Full repository behavior or live providers. |
| `npm run trust:effect-ledger` | 0 | 2/2 mutation tests; 14 production sources; 24 effect kinds; zero missing or stale source entries. | That every listed provider mutation has live-account proof. |
| Roadmap build-order generator and test | 0 | Eleven open cards; `TRUST-02` stays building; `TRUST-04`, `TRUST-01`, `OP-01`, and `GROW-01` remain next. | Product shipment by itself. |
| `npm run typecheck` and `npm run desktop:renderer:typecheck` | 0 / 0 | Runtime and renderer TypeScript passed. | Runtime behavior. |
| Initial `npm test` | 1 | 13,929 passed and 3 skipped; four unrelated tests hit the default 20-second timeout under full-suite load. | A green aggregate. This result is retained, not erased. |
| Exact timeout-file reruns | 0 / 0 / 0 | `interactive-turn` 2/2, `turn-loop` 13/13, and `spec-to-app-cmd` 1/1 passed with a 60-second ceiling. | The full aggregate by themselves. |
| `npx vitest run --testTimeout=60000 --reporter=dot` | 0 | 1,511 files; 13,933 passed; 3 skipped. | Rust, website, Electron behavior, or live providers. |
| `cargo test` | 0 | 70/70 passed with one unchanged unused-import warning. | Any protected Rust change; none was made. |
| `npm run build` in `vanta-website` | 0 | Optimized production build generated after the 1-building/4-next roadmap projection. | Deployment. |
| Semgrep on 28 changed source/script files | 0 | 109 rules and zero payload findings after excluding one unchanged exact-origin CORS rule. The unchanged rule was separately observed and is covered by local-origin tests. | Whole-history review or a claim that the unchanged rule vanished. |
| Gitleaks over the binary worktree diff plus every untracked file | 0 | Approximately 1.37 MB scanned; zero leaks found. | Unrelated historical repository content. |
| `npm audit --omit=dev` | 1 | Five high transitive advisories in `adm-zip` and `sharp`; both chains report no fix available. No dependency or lockfile changed here. | Dependency-audit green; it is explicitly not claimed. |
| Size test and `git diff --check` | 0 / 0 | The 300-line source-file gate passed inside the full suite; no whitespace errors. | Behavioral correctness. |
| Protected-path and Hermes/Nightcode payload checks | 0 | No root `src/**`, factory, manifesto, Hermes, or Nightcode path appeared. | Unrelated history outside this payload. |

## Claim ledger

| Claim | Class | Evidence boundary |
| --- | --- | --- |
| The local/read-only UX-03 continuity wedge works through process restart. | Executed | Real source Electron, isolated project/profile, three launches. Not a packaged or cross-platform claim. |
| Prepared actions do not replay after retained success or an orphaned uncertain run. | Executed | Store tests and real restart proof for the local read effect. Not every external provider. |
| Current `executeEffect` TypeScript callsites have complete ledger entries. | Executed | Filesystem-derived ledger validation plus missing/stale mutation tests. Not proof that unlisted older boundaries are already migrated. |
| Pattern/global refusal persists and session refusal resets. | Executed | Focused API restart tests plus real session restart proof. |
| `TRUST-04`, `TRUST-01`, or `OP-01` is complete. | Not claimed | Each card remains `next` with an explicit dependency and Done gap. |
| Paid co-design or market evidence exists. | Not claimed | `GROW-01` is deferred at the operator's instruction. |

## Authority and repository boundary

- GitHub Actions are disabled and will not be used.
- No paid service, live account, participant, outreach, billing, release,
  publication, notarization, deployment, merge, or direct push to `main` is in
  scope.
- Root `src/**`, `vanta-ts/src/factory/**`, and `MANIFESTO.md` are protected and
  must remain unchanged.
- No Hermes or Nightcode content, checkout, state, or credential belongs in
  this repository or its published change payload.
- This branch may be committed and pushed only after the final local gate is
  green. Published commits must not be rewritten.

## Re-entry order

1. Commit and publish this exact locally verified checkpoint without rewriting
   history.
2. Continue `TRUST-02`; do not bypass it to promote dependent cards.
3. After `TRUST-02`, close `TRUST-04` across all representative hosts.
4. Then close `TRUST-01` gateway gaps and `OP-01` writer cutover in roadmap
   order.
5. Return to paid `GROW-01` co-design only with separate authority and a chosen
   non-Actions operating budget.
