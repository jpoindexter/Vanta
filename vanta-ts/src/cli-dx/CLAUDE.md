# CLAUDE.md — vanta-ts/src/cli-dx

Developer-facing CLI utilities.

- `config.ts`: show/get/set/edit/migrate/check `.env` config. Secrets are masked; config writes fire `ConfigChange` hooks with `matcherValue: "project_settings"`.
- `backup.ts`, `completion.ts`, `prompt-size.ts`: local CLI helpers; keep them thin and testable.
