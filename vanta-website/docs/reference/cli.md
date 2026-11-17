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
| `vanta mcp list` | Show project connector source, trust, auth, health, tools, and resources |
| `vanta mcp test <server>` | Test one connector and record its redacted inventory receipt |
| `vanta mcp reconnect <server>` | Reconnect, rediscover inventory, and record the outcome |
| `vanta mcp enable\|disable <server>` | Change project-local connector enablement |
| `vanta mcp trust <server> allow\|deny` | Record the project trust decision; kernel safety remains active |
| `vanta mcp receipts` | Show recent credential-free connector lifecycle receipts |

> Counts and exact flags evolve; `vanta help` is the live source of truth.

## Source-candidate recovery diagnostics — 2026-11-17

These additions require the current integration source. They are not included
in the previously delivered Desktop 0.1.3 or the unchanged normal CLI pin.
Rebuilding source is separate from installing or updating a packaged app.

| Command | Does |
|---------|------|
| `vanta doctor --fallbacks` | Reports every configured fallback entry, in order, without inference or subscription credential-store lookup. `configuration-resolved` does not mean authenticated or reachable. Review entries marked unavailable or not checked; exit 1 means at least one needs attention. |
| `vanta agents delegation inspect <id>` | Reads a new worker's owned private partial checkpoint offline. It does not resume work, replay tools or restore permissions. Historical workers may have no partial checkpoint. |

The inspection command reports remaining budget as unknown and keeps uncertain
effects under review. Existing delegation `replay`/`follow-up` creates a **new
task**, not continuation from the saved checkpoint. Never use it to retry an
external action whose outcome is unknown. Keep any retained worktree and branch
until its files and results have been reviewed.

For a connector shown as `auth needs_auth`, review its authentication through
the normal connection/setup flow, then test it explicitly. A saved successful
probe does not override a token's known expiration; unknown expiration does not
prove a working connection. Diagnostics do not silently launch interactive OAuth.
