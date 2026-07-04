# CLAUDE.md — vanta-ts/src/cli-dx

Developer-facing CLI utilities.

- `config.ts`: show/get/set/edit/migrate/check/revisions/rollback `.env` config. Secrets are masked; config writes fire `ConfigChange` hooks with `matcherValue: "project_settings"`. PCLIP-CONFIG-REVISION: `setConfig`/`migrateConfig` snapshot the pre-write content via `config-revisions.ts` before every write; `rollbackConfig(repoRoot, rev?)` restores a specific revision (or the latest = undo-last-change when omitted) and snapshots first, so a rollback is itself reversible.
- `config-revisions.ts`: pure `.vanta/config-revisions.jsonl` store (append/list/get/latest) — zod-validated, tolerant reads (a corrupt line is dropped, never wedges rollback).
- `backup.ts`, `completion.ts`, `prompt-size.ts`: local CLI helpers; keep them thin and testable.
