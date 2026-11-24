# AGENTS.md — vanta-ts/src/settings

Layered non-secret settings loader for user, project, and local scopes.

- `store.ts` loads `~/.vanta/settings.json`, `.vanta/settings.json`, then `.vanta/settings.local.json`; local wins.
- Schema is strict and partial. The layered reader strips unknown keys but rejects malformed JSON, unreadable scopes and invalid recognized values; it never replaces policy with an empty fallback or a metadata cache.
- Current notable settings: `allowedTools`, `blockedTools`, `env`, `gates`, `disableAgentView`, `effortLevel`, `autoMode`, `ui`, `plugins.enabled`, `plugins.trustProjectPlugins`, `api_key_helper`.
- Keep settings non-secret; secrets belong in `.env` or helper commands.
- `plugins.enabled` is an opt-in allow-list for runtime plugin code. Project plugins also require `plugins.trustProjectPlugins=true` plus `VANTA_ENABLE_PROJECT_PLUGINS=true`.
