# Vanta Plugin Framework — "plugins like Claude/Codex/Hermes"

> Roadmap: `PLUGIN-FRAMEWORK` + `PLUGIN-HOOKS` (build on `PLUGIN-SYSTEM` install hygiene +
> `AUTH-BROWSER`). Source: the plugins goal + Hermes plugin docs extraction (2026-06-05).

## What Vanta already has (don't rebuild)

Vanta has most of the *pieces* — it lacks the unifying framework:
- **Tool registry** (`tools/registry.ts`, `buildRegistry`) — register tools.
- **MCP** (`mount_mcp`, MCP-1/2/3) — external tools at runtime (the "external server" plugin half).
- **Claude Code hooks** (shipped) — lifecycle hooks.
- **MSG-REGISTRY** — the platform-adapter registry pattern (Hermes's `register_platform`).
- **Skills library** — bundled knowledge (`plugin:skill` equivalent).
- **Providers** — swap-by-env model backends.

What's missing is **one plugin contract** that ties tool + hook + command + provider + platform +
skill registration together with opt-in install + discovery precedence.

## The Hermes model (the blueprint)

A plugin = a self-contained module that extends the agent **without modifying core**, via a
`register(ctx)` entry receiving a `PluginContext`:

| `ctx.` API | Adds |
|---|---|
| `register_tool()` | an LLM-callable tool (schema + handler) |
| `register_hook()` | a lifecycle callback |
| `register_command()` | a `/slash` command |
| `register_cli_command()` | an `argo <plugin> <sub>` subcommand |
| `register_skill()` | bundled knowledge |
| `register_provider()` / `register_platform()` | a model backend / messaging channel |
| `llm.complete()` | borrow the user's active model for a one-shot |
| `dispatch_tool()` / `inject_message()` | invoke a tool / feed a message |

**Discovery precedence** (later overrides earlier by name): bundled (`argo-ts/plugins/`) → user
(`~/.argo/plugins/`) → project (`.argo/plugins/`, gated by `VANTA_ENABLE_PROJECT_PLUGINS=true`) →
npm package entry points.

**Opt-in allow-list** (the security model): general plugins are **disabled by default**; the user
adds names to `plugins.enabled` in config before they load — "stops third-party code running
without your explicit consent." Vanta adds its kernel on top: **every plugin tool still routes
through `assess()`** (a hard boundary Hermes lacks — Hermes plugins run unsandboxed in-process).

**Categories:** general (multi-select) · memory provider (single-select) · context engine
(single-select) · model provider (multi-register, pick one) · platform adapter (multi-select).

**Lifecycle hooks:** `pre_tool_call` · `post_tool_call` · `pre_llm_call` · `post_llm_call` ·
`on_session_start/end/finalize/reset` · `subagent_stop` · `pre_gateway_dispatch`
(returns skip/rewrite/allow — auth/filtering).

**Management:** `argo plugins` (interactive) · `install <owner/repo>` · `enable/disable <name>` ·
`update` · `remove`. Manifest = a small `plugin.yaml`/`plugin.json` (name, version, requires_env).

## Plugin vs MCP vs skill vs slash command (keep distinct)

- **Plugin** — in-process code extension (tools/hooks/commands/providers). The framework.
- **MCP server** — *external* process exposing tools (already shipped: `mount_mcp`).
- **Skill** — passive knowledge file, loaded on demand (already shipped).
- **Slash command** — a UI shortcut, often dispatches a plugin/tool (already shipped).

A plugin can bundle skills, register commands, and dispatch tools/MCP.

## Build order

1. **`PLUGIN-FRAMEWORK`** — `plugins/context.ts` (`PluginContext`) + `register(ctx)` loader +
   discovery precedence + `plugins.enabled` allow-list + `argo plugins` CLI. Wrap the existing
   registry/MCP/skills so a plugin can register a kernel-gated tool. Manifest schema (zod).
2. **`PLUGIN-HOOKS`** — the lifecycle hook bus (pre/post tool, pre/post LLM, session events,
   subagent_stop) plugins attach to; fold the existing Claude Code hooks into it.
3. Migrate one built-in (e.g. a tool group) to a bundled plugin as the reference example +
   a `build-a-plugin` skill.

The kernel stays the boundary: a plugin is *cheaper to add*, never *more privileged*.
