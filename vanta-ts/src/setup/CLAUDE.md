# CLAUDE.md — setup helpers

Live first-run setup validation helpers used by `vanta setup`.

## File Map

| File | Role |
|------|------|
| `assistant.ts` | Provider/Google/MCP/messaging live probes plus the skippable Google OAuth step. |
| `assistant.test.ts` | Probe behavior, redaction, and Google-step wiring tests. |

## Rules

- Return `{ ok, detail }` values; do not throw across the setup command boundary.
- Redact long env secret values from all returned details before printing.
- Validate real backends: provider completion, OAuth token state after loopback auth, MCP mount/list-tools, Telegram Bot API when configured.
- Planned integrations remain preview-only; never write a fake enable flag for an unwired backend.
