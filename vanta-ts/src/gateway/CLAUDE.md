# CLAUDE.md — vanta-ts/src/gateway

Gateway order matters:

1. Drain queued loop wake events first.
2. Run due cron/factory entries.
3. Write heartbeat.
4. Evaluate clock-based loop triggers.
5. Poll platform messages.

Webhook handling responds quickly and runs the agent turn asynchronously. When adding wake paths, pass a compact `WakeContext`; do not pass raw history or secrets.

Outbound replies copy `threadId` from the inbound message (forum-topic routing, MSG-TELEGRAM-ROBUST) — any adapter that understands threads reads `OutboundMessage.threadId`; Telegram sends `message_thread_id`, retries 429 flood control bounded, and suppresses link previews.

Expand inbound `@file`/`@folder`/`@diff`/`@staged`/`@git`/`@url` references before queueing. Resolve the root, model budget, and profile/session identity from that message; never re-resolve queued work against later mutable state.
