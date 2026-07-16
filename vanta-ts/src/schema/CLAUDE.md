# Schema task environments

Use `TaskEnvironment` for a bounded, replayable task substrate. Use `TaskTransitionTimeline` for append-only, redacted transition events on the kernel audit chain. Use `groundTransition` and immutable revisions for interpreted task state. Run generated transition code only through `executeTaskModel`; it fails closed without the strict platform sandbox, uses declared inputs, and records a receipt. Keep live browser, repository, operator, and cryptographic verification I/O behind injected callers.
