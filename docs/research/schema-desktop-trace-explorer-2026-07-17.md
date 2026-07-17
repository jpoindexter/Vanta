# Schema desktop trace explorer proof

Date: 2026-07-17

Roadmap card: `SCHEMA-DESKTOP-TRACE-EXPLORER`

## Shipped behavior

- Desktop run receipts can persist a typed Schema trace with plan/run identity, queue state, model certification, and transition evidence.
- The existing failed-run recovery surface exposes the trace through an optional native disclosure instead of adding another dashboard.
- Each transition shows simulated versus real execution, match/mismatch/revised state, model version, predicted and observed values, pointed path, model diff, and backtest receipt.
- A Schema mismatch disables retry and names the complete-history recertification requirement. A recertified resumed queue enables retry.
- Resizing to 760px closes a desktop inspector that would otherwise cover the composer; an intentionally opened compact inspector still uses the existing mobile panel flow.

## Executed proof

- Focused component, chat, backend recertification, and session round-trip tests: 28 passed.
- Core and desktop renderer TypeScript checks: passed.
- Source Electron Schema fixture: optional disclosure, keyboard open, simulated match, real mismatch, stop reason, model diff, backtest, recertification gate, resumed run, and 760px no-overflow all passed.
- Full desktop flow proof: source and signed packaged app passed shell, work recovery, Schema trace, long-session navigation, queued turns, runtime profiles, attachments, sessions, and outputs/connect flows.
- Full repository suite: 1,410 test files passed; 13,367 tests passed; 3 skipped.
- `git diff --check`: passed before closeout.

## Boundaries

The Electron fixture proves the complete desktop interaction contract with deterministic Schema receipts. The backend tests separately execute a real mismatch, model revision, complete-history backtest, recertification, and resumed-permission check. This does not claim that every ordinary Vanta run produces a Schema trace; the trace is optional and appears when Schema evidence is attached to the run receipt.
