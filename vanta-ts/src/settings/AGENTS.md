# AGENTS.md — vanta-ts/src/settings

Layered non-secret settings loader for user, project, and local scopes.

- `store.ts` loads `~/.vanta/settings.json`, `.vanta/settings.json`, then `.vanta/settings.local.json`; local wins.
- Schema is strict and partial: unknown keys are dropped by `safeParse`, not thrown.
- Current notable settings: `allowedTools`, `blockedTools`, `env`, `gates`, `disableAgentView`, `autoMode`, `ui`, `api_key_helper`.
- Keep settings non-secret; secrets belong in `.env` or helper commands.
