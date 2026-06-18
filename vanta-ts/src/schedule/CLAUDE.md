# CLAUDE.md — vanta-ts/src/schedule

Keep schedule code decoupled from the agent runtime. `runner.ts` receives a `RunTask` so tests can exercise due filtering and error isolation without provider setup.

Cron wakes add `WakeContext` metadata (`wake_reason`, `goal_id`, `since`, `delta`) before the task reaches the agent. Preserve the original cron entry fields in results for observability.
