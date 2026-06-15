# AGENTS.md — vanta-ts/src/plugins

Runtime plugin framework plus plugin install hygiene.

- `catalog.ts` is capability install/location hygiene; keep it separate from runtime code loading.
- Runtime plugins are opt-in code extensions loaded from manifests only when listed in `plugins.enabled`.
- Disabled plugins must not import code. Discovery may read manifests, but registration code runs only after allow-list checks.
- Plugin tools must register as normal tools and enter the existing kernel `assess()` path.
- Do not expose raw registries, settings writers, shell helpers, or unbounded process access through `PluginContext`.
- Project plugins require both explicit settings trust and `VANTA_ENABLE_PROJECT_PLUGINS=true`.
