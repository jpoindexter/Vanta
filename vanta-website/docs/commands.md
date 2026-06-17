---
id: commands
title: Slash commands
sidebar_position: 4
---

# Slash commands

An interactive session exposes **97 slash commands**. `/help` lists them all; below are the most useful, grouped. The composer also takes `@file` (inline file as context), `!` (shell), and `#` (memory).

## Session & goals
| Command | Does |
|---------|------|
| `/goal [text\|resume\|clear\|done]` | Show / set / resume / drop the working goal |
| `/next` | Surface one concrete next micro-step from your goals |
| `/where` · `/wm` | Working-memory breadcrumb (last intent + recent tools) |
| `/planmode [on\|off]` | Plan-first mode (propose before acting) |
| `/restart` | Relaunch the session (picks up code changes) |
| `/handoff` · `/bug` | Write a continuity packet / a bug record |

## Model & cost
| Command | Does |
|---------|------|
| `/model [id]` | Show or hot-swap the model (persists to `.env`) |
| `/effort <low\|medium\|high\|max>` | Set reasoning effort live |
| `/usage` | Per-session cost split (local-free vs metered) |

## Memory, skills, knowledge
`/skills` · `/skill <name>` · `/recall` · `/context` (token breakdown) · `/cockpit` (kernel ladder + live goals + loops).

## Deep work
`/ultrathink` · `/ultracode` · `/deep-research` · `/skeptic` (adversarially refute a claim) · `/solutioning`.

## Operator views
`/world` · `/money` · `/radar` · `/team` · `/lifesearch` · `/compartments` · `/locks` · `/reach` — see [Operator systems](./operator-systems.md).

## Project & lifecycle
`/init` (generate a project context/instructions file) · `/roadmap` · `/changes` (interactive edit review) · `/loops` · `/open <file:line>`.

> Counts are current as of the latest source sync; `/help` is always the authoritative, live list.
