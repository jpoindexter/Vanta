# AGENTS.md — vanta-ts/src/schedule

Durable cron scheduling for non-interactive Vanta tasks.

- `cron.ts` parses/evaluates cron expressions.
- `durable-cron.ts` owns the persisted task table.
- `runner.ts` filters active due tasks and invokes the injected `RunTask`.
- Non-interactive scheduled tasks deny human approvals by default through the CLI runner.
- Scheduled work should receive compact wake context, not hidden global state.
