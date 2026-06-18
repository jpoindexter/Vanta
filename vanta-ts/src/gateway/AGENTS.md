# AGENTS.md — vanta-ts/src/gateway

Gateway daemon surfaces: cron ticks, loop wake/spawn, messaging platform polling, webhook ingestion, and pairing.

- `run.ts` coordinates one gateway tick and the foreground daemon loop.
- `loops-tick.ts` decides clock-based loop wakes and passes compact wake context to the child process.
- `child-ops.ts` owns detached child spawning, platform polling, and webhook dispatch helpers.
- `webhook.ts` owns the HTTP listener and HMAC verification.
- Keep long-running work detached or injected; a gateway tick must stay responsive.
