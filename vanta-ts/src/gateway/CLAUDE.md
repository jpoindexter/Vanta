# CLAUDE.md — vanta-ts/src/gateway

Gateway order matters:

1. Drain queued loop wake events first.
2. Run due cron/factory entries.
3. Write heartbeat.
4. Evaluate clock-based loop triggers.
5. Poll platform messages.

Webhook handling responds quickly and runs the agent turn asynchronously. When adding wake paths, pass a compact `WakeContext`; do not pass raw history or secrets.
