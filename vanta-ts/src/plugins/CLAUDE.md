# CLAUDE.md — vanta-ts/src/plugins

Plugin surface for Vanta.

- `hooks.ts`: lightweight lifecycle hook bus; currently only some events are wired elsewhere.
- `catalog.ts`: install hygiene for optional capabilities, not code-extension loading.
- `manifest.ts`: strict JSON manifest parsing for runtime plugins.
- `context.ts`: constrained `PluginContext` used by plugin `register(ctx)`.
- `loader.ts`: deterministic discovery and enabled-plugin loading.
- `commands.ts`: dynamic slash-command registry for plugin commands.

Invariant: plugin code is cheaper to add, never more privileged. Tools must remain kernel-gated, command collisions must fail closed, and disabled plugin code must not be imported.
