# Vanta Plugin Framework — "plugins like Claude/Codex/prior agent"

> Roadmap: `PLUGIN-FRAMEWORK` + `PLUGIN-HOOKS` (build on `PLUGIN-SYSTEM` install hygiene +
> `AUTH-BROWSER`). Source: the plugins goal + reference agent plugin docs extraction (2026-06-05).

## Current state (shipped 2026-06-15)

`PLUGIN-FRAMEWORK` is now the opt-in in-process code-extension layer. `PLUGIN-SYSTEM`
remains install/location hygiene in `plugins/catalog.ts`; MCP remains external-process tool mounting.

Shipped v1 surface:
- Manifest: strict JSON `plugin.json` with `name`, `version`, optional `main`, `description`,
  `tools`, `commands`, `requiresEnv`, `worker`, and bounded `dashboardPanels`.
- Discovery: bundled `vanta-ts/plugins/`, then user `~/.vanta/plugins/`, then project
  `.vanta/plugins/` only when `plugins.trustProjectPlugins=true` and
  `VANTA_ENABLE_PROJECT_PLUGINS=true`.
- Enablement: plugins are disabled by default and load only when their manifest name is listed
  in `plugins.enabled`.
- Runtime: `src/plugins/loader.ts` imports only enabled plugins and calls `register(ctx)`.
- `PluginContext`: `registerTool(tool)`, `registerCommand(name, handler, meta)`, plugin metadata,
  repo root, Vanta home, and a scoped logger.
- Safety: plugin tools register as normal `Tool`s and execute through the existing
  `dispatchTool -> safety.assess()` path. Tool names must start with `plugin_<plugin-name>_`,
  cannot collide with existing tools, and must provide `describeForSafety`.
- Slash commands: plugin commands are stored in a runtime registry, built-ins win on collision,
  and `/help` includes loaded plugin command metadata.

Acceptance verified: a third-party plugin fixture under `~/.vanta/plugins`, enabled through
`plugins.enabled`, registers a kernel-gated tool plus slash command; disabled plugins do not
import; project plugins stay disabled unless both trust controls are present.

### Dashboard panel slots

An isolated worker plugin can declare up to eight panels in `plugin.json`:

```json
{
  "dashboardPanels": [{
    "id": "status",
    "title": "Worker status",
    "provider": "loadStatus",
    "refreshMs": 10000,
    "requiredCapabilities": ["ui.panel", "schedule.jobs"],
    "actions": [{ "id": "refresh", "label": "Refresh", "prompt": "Refresh worker status" }]
  }]
}
```

Titles, refresh intervals, actions, and permissions are host-owned manifest data;
the worker can update only the bounded line payload. Missing grants leave the panel
permission-disabled. `vanta home` reports ready/disabled slots and `/plugin-panels`
renders live content. Numbered actions become normal Vanta turns, so any tool use
still crosses the kernel permission gate. Press `d` in a panel to route a disable
request through the same gated path.

Not shipped in this slice: npm loading, CLI enable/disable management, provider/platform
registration, plugin hooks, `llm.complete`, `dispatch_tool`, background monitors, or hot reload.

## What Vanta already has (don't rebuild)

Vanta has most of the *pieces* — it lacks the unifying framework:
- **Tool registry** (`tools/registry.ts`, `buildRegistry`) — register tools.
- **MCP** (`mount_mcp`, MCP-1/2/3) — external tools at runtime (the "external server" plugin half).
- **another agent hooks** (shipped) — lifecycle hooks.
- **MSG-REGISTRY** — the platform-adapter registry pattern (reference `register_platform`).
- **Skills library** — bundled knowledge (`plugin:skill` equivalent).
- **Providers** — swap-by-env model backends.

The first shipped contract ties tools + slash commands together with opt-in install +
discovery precedence. Hooks, providers, platforms, skills, and plugin-owned model/tool dispatch
remain later layers.

## The reference plugin model (the blueprint)

A plugin = a self-contained module that extends the agent **without modifying core**, via a
`register(ctx)` entry receiving a `PluginContext`:

| `ctx.` API | Adds |
|---|---|
| `register_tool()` | an LLM-callable tool (schema + handler) |
| `register_hook()` | a lifecycle callback |
| `register_command()` | a `/slash` command |
| `register_cli_command()` | an `vanta <plugin> <sub>` subcommand |
| `register_skill()` | bundled knowledge |
| `register_provider()` / `register_platform()` | a model backend / messaging channel |
| `llm.complete()` | borrow the user's active model for a one-shot |
| `dispatch_tool()` / `inject_message()` | invoke a tool / feed a message |

**Discovery precedence** (later plugin manifests override earlier plugin manifests by name):
bundled (`vanta-ts/plugins/`) → user (`~/.vanta/plugins/`) → project (`.vanta/plugins/`, gated by
both `plugins.trustProjectPlugins=true` and `VANTA_ENABLE_PROJECT_PLUGINS=true`). npm package
entry points are deferred.

**Opt-in allow-list** (the security model): general plugins are **disabled by default**; the user
adds names to `plugins.enabled` in config before they load — "stops third-party code running
without your explicit consent." Vanta adds its kernel on top: **every plugin tool still routes
through `assess()`** (a hard boundary the prior agent lacks — reference plugins run unsandboxed in-process).

**Categories:** general (multi-select) · memory provider (single-select) · context engine
(single-select) · model provider (multi-register, pick one) · platform adapter (multi-select).

**Lifecycle hooks:** `pre_tool_call` · `post_tool_call` · `pre_llm_call` · `post_llm_call` ·
`on_session_start/end/finalize/reset` · `subagent_stop` · `pre_gateway_dispatch`
(returns skip/rewrite/allow — auth/filtering).

**Management:** `plugins.enabled` in settings is the shipped enablement path. `vanta plugins`
still manages install hygiene for optional capabilities; enable/disable/update/remove for runtime
plugins is deferred. Manifest = a small JSON `plugin.json`.

## Plugin vs MCP vs skill vs slash command (keep distinct)

- **Plugin** — in-process code extension (tools/hooks/commands/providers). The framework.
- **MCP server** — *external* process exposing tools (already shipped: `mount_mcp`).
- **Skill** — passive knowledge file, loaded on demand (already shipped).
- **Slash command** — a UI shortcut, often dispatches a plugin/tool (already shipped).

A plugin can bundle skills, register commands, and dispatch tools/MCP.

## Build order

1. **`PLUGIN-FRAMEWORK`** — shipped v1: `plugins/context.ts` (`PluginContext`) + `register(ctx)`
   loader + discovery precedence + `plugins.enabled` allow-list. Wraps the existing tool registry
   so a plugin can register a kernel-gated tool and slash command.
2. **`PLUGIN-HOOKS`** — the lifecycle hook bus (pre/post tool, pre/post LLM, session events,
   subagent_stop) plugins attach to; fold the existing another agent hooks into it.
3. Migrate one built-in (e.g. a tool group) to a bundled plugin as the reference example +
   a `build-a-plugin` skill.

The kernel stays the boundary: a plugin is *cheaper to add*, never *more privileged*.
