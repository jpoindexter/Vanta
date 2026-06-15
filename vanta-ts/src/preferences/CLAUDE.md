# CLAUDE.md — preferences

Durable operator preference data lives here.

## Map

| File | Purpose |
|------|---------|
| `signals.ts` | Append/read/export `~/.vanta/preferences.jsonl`; each row is a zod-validated chosen-vs-rejected pair with provenance. |
| `signals.test.ts` | Regression tests for missing/corrupt files, approval mapping, sanitizer, and JSONL export. |

## Decisions

- JSONL over a database: append-only, local-first, easy to export for later personal-model tuning.
- Approval prompts record only human outcomes. Kernel blocks, auto-mode decisions, and rule/profile auto-decisions do not create human preference rows.
- Sanitization is defense-in-depth, not a secret scanner; keep context short and avoid adding raw high-risk payloads.
