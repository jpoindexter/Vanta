# AGENTS.md — vanta-ts/src/public-api

The public API is the token-authenticated remote operator surface hosted by the desktop HTTP server.

- Route liveness and readiness before `getSession`; health probes must not allocate sessions, call `prepareRun`, or mutate token/state stores.
- Keep `/api/v1/live` cheap and unauthenticated. Keep `/api/v1/readiness` and its `/status` compatibility alias bearer-authenticated without touching `lastUsedAt`.
- Readiness checks must be bounded by time, entry count, and file size. Return only status enums and counts: never secrets, config values, paths, commands, payloads, identifiers, or raw errors.
- Degraded runtime state is a successful HTTP response with `status: "degraded"`; reserve transport errors for auth, routing, and server failures.
