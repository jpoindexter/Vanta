# AGENTS.md — setup helpers

Focused first-run setup probes and orchestration helpers for `vanta setup`.

## File Map

| File | Role |
|------|------|
| `assistant.ts` | Live validation probes for provider, Google OAuth, MCP mounts, and configured messaging. |
| `assistant.test.ts` | Vitest coverage for probe behavior and skippable Google step wiring. |

## Rules

- Keep secrets out of returned `detail` strings and logs.
- Prefer real probes over saved-flag checks: provider completion, OAuth token check after loopback auth, MCP mount/list-tools, messaging API checks.
- Planned integrations stay preview-only; do not write enable flags for backends without live adapters.
