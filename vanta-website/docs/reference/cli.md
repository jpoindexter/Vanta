---
id: cli
title: CLI reference
sidebar_position: 1
---

# CLI reference

Run from the repo with `./run.sh` (alias `./vanta`), or globally as `vanta` after `./install.sh`. `./run.sh help` lists everything.

## Core

| Command | Does |
|---------|------|
| `vanta` | Interactive session (runs first-run setup if unconfigured) |
| `vanta run "<instruction>"` | One-shot; kernel auto-starts |
| `vanta setup [messaging]` | Pick a model backend / configure messaging |
| `vanta doctor` | Health: kernel ping, provider, key presence, store, goals |
| `vanta status` | Status summary |
| `vanta help` | List subcommands |

## Session lifecycle

| Command | Does |
|---------|------|
| `vanta resume <id> [--fork-session]` | Resume a saved session (optionally into a new id) |
| `vanta sessions` | List saved sessions |
| `vanta --init` / `--init-only` / `--maintenance` | Run Setup / SessionStart lifecycle hooks |
| `vanta maintenance [status\|queue\|resolve\|docs\|budget]` | Review human blockers, documentation-router health, and the maintenance budget |
| `vanta --effort <low\|medium\|high\|xhigh\|max>` | Set reasoning effort |
| `vanta --permission-mode auto\|default` | Permission mode |

## Knowledge & projects

| Command | Does |
|---------|------|
| `vanta skills` / `skill <name> ["<instr>"]` | List / run learned skills |
| `vanta skills install` | Install the bundled skill library |
| `vanta modes [install]` | The operator modes |
| `vanta rooms` / `room <name> "<instr>"` | Per-project goal streams |
| `vanta memory` / `goals` | Inspect memory / goals |
| `vanta init` | Generate a project context/instructions file |

## Automation & services

| Command | Does |
|---------|------|
| `vanta schedule "<instr>" --cron "..."` / `schedule list` / `cron` | Scheduled tasks |
| `vanta gateway` | Always-on cron + messaging + webhook loop |
| `vanta service install\|uninstall\|status` | Keep the gateway alive (launchd, macOS) |
| `vanta agents` · `attach`/`logs`/`respawn`/`stop`/`rm <id>` | Background worker management |
| `vanta auth google` | One-time Google OAuth |

## Dev & ops

| Command | Does |
|---------|------|
| `vanta lint [files\|--staged]` | Code-size gate |
| `vanta roadmap [serve]` | Roadmap board |
| `vanta roadmap proof-status\|proof-packet\|proof-accept` | Check, package, or accept parked external-proof gates |
| `vanta open <file[:line]>` | Open in `$EDITOR` |
| `vanta mcp serve` | Run Vanta as an MCP server |

> Counts and exact flags evolve; `vanta help` is the live source of truth.
