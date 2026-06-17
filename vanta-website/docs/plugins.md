---
id: plugins
title: Plugins
sidebar_position: 2
---

# Plugins

Vanta has an opt-in, in-process plugin framework. Plugins add tools and slash commands; everything they register runs through the same kernel-gated dispatch path.

## Where plugins live

- **User plugins** — `~/.vanta/plugins/<name>/plugin.json`
- **Project plugins** — only loaded with explicit trust: `plugins.trustProjectPlugins=true` **and** `VANTA_ENABLE_PROJECT_PLUGINS=true`

Only plugins in the `plugins.enabled` allow-list load; disabled plugins are not imported.

## What a plugin can do

A plugin's `register(ctx)` receives a `PluginContext` exposing:

- `registerTool` — plugin tools must be namespaced (`plugin_<name>_...`), define `describeForSafety`, avoid collisions, and execute through the kernel-gated dispatch like any tool.
- `registerCommand` — adds a slash command.

## Manifest

`plugin.json` is strictly validated. The loader enforces the allow-list, namespace rules, and trust requirements before a plugin runs.

> Deferred (not yet in v1): npm-based loading, plugin-provided providers / platforms / hooks, and CLI runtime-plugin management.

For the other extension points (tools, providers, search backends, MCP), see [Extending Vanta](./extending.md).
