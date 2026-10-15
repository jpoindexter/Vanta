# OP-01 operator-spine audit — 2026-08-04

## Verdict

`OP-01` closes its bounded read-only Done contract. This is a local product
capability result, not a merge, release, deployment, publication, or legacy
writer cutover.

## Implemented boundary

- One `OperatorSpineSnapshot` projects the existing Vanta stores; it creates no
  new persistence location and does not change `operator-work.json`.
- Sources include team tasks, workflow tasks, tickets, legacy and durable
  schedules, sessions, run-library records, kanban lanes, canonical WorkItems,
  Runs, Approvals, and action receipts.
- Every projected item retains its original source type, ID, and path and
  exposes outcome, exact lifecycle state, owner, wait condition, next action,
  resume context, provenance, follow-up, time/capacity fit, blocker, artifacts,
  related Run/Approval/Receipt IDs, and the current Run attempt.
- `draft`, `queued`, `running`, `waiting`, `needs human`, `stopped`, `failed`,
  `unverified`, and `verified` remain the only lifecycle states.
- Captured, Now, Waiting, Needs You, and Done are views only. A legacy `done`
  claim maps to `unverified`; only canonical `verified` records enter Done or
  accomplishment memory.
- Receipt dispositions remain independent from lifecycle state.
- Source count, projected count, source IDs, projected IDs, source SHA-256, and
  projection SHA-256 are deterministic and restart-stable. Missing stores are
  explicit; corrupt rows and unreadable stores degrade visibly without writes.
- Desktop receives the facade through the existing continuity API and exposes
  reconciliation under Sources. The TUI `/operator-spine` command delegates to
  the same CLI formatter and snapshot builder.

## Exact source-to-projection mapping

| Source | Source status | Projected WorkItem state |
| --- | --- | --- |
| Team task | `assigned`, `pending`, `running`, `blocked`, `done`, `stopped`, `removed`, `failed` | `queued`, `queued`, `running`, `needs human`, `unverified`, `stopped`, `stopped`, `failed` |
| Workflow task | `running`, `done`, `failed` | `running`, `unverified`, `failed` |
| Ticket | `open`, `in_progress`, `done`, `closed` | `draft`, `running`, `unverified`, `stopped` |
| Schedule | active, paused, script without bound authority | `waiting`, `stopped`, `needs human` |
| Session | active/unknown, done, failed | `waiting`, `unverified`, `failed` |
| Run library | interrupted, done, failed | `waiting`, `unverified`, `failed` |
| Kanban lane | todo, running, blocked, done | `queued`, `running`, `needs human`, `unverified` |
| Continuity and canonical WorkItem | exact contract state | unchanged |
| Effect Run, Approval, Receipt | exact contract | retained and linked; receipt disposition stays separate |

## Executed acceptance

`npm run op-01:proof` uses disposable project and Vanta-home fixtures. It starts
the real Desktop HTTP server twice, reads `/api/continuity`, invokes the exact
CLI command used by the TUI bridge, and compares deterministic digests and file
manifests.

Observed result:

```text
status: PASS
Desktop restarts: 3
exact resume action: Verify the continuity closure
Desktop/TUI digest: matched exactly within the proof and across its restarts
effect: approved, one provider call, confirmed/verified receipt
views: Captured 0, Now 0, Waiting 4, Needs You 2, Done 1
source types: 12
legacy source bytes changed: 0
```

Focused OP-01, contract, continuity, Desktop API/renderer, and CLI tests passed
102/102. The full TypeScript suite passed 14,033 tests with 3 skipped. Runtime,
renderer, and TypeScript 7 checks passed. The signed packaged app completed the
three-launch continuity/re-entry proof with zero serious accessibility findings,
one consequential provider call, and unchanged fixture source bytes. The full
command ledger and inherited dependency caveat are retained in the draft pull
request.

## Explicit non-claims

- No legacy writer changed ownership and no dual-write began.
- No bounded rollback or retirement proof was needed because no cutover occurred.
- No uncertain or legacy-complete record was promoted to verified.
- No live account, external participant, paid research, or outreach was used.
- No protected Rust kernel, protected factory, or `MANIFESTO.md` source changed.
- GitHub Actions remain disabled and are not release evidence.
