---
id: commands-list
title: Command reference
sidebar_position: 4
---

# Command reference

Every slash command, generated from the command catalog — **103 commands**. Type any of these in an interactive session; `/help` prints the live list.

## Session & history

| Command | Description |
|---|---|
| `/help` | show this command list |
| `/clear` | start a fresh conversation (keeps the session log) |
| `/reset` | start a fresh conversation (alias of /clear) |
| `/history` | show this conversation's transcript |
| `/export` | export this conversation to a markdown file |
| `/retry` | re-run your last message |
| `/undo` | drop the last turn from the conversation |
| `/rewind` | list or restore recent per-edit file checkpoints |
| `/title` | name the current session |
| `/fork` | branch the current conversation into a new session |
| `/restart` | reload Vanta in place with fresh code (needs ./run.sh) |
| `/exit` | leave the session |

## Goals & focus

| Command | Description |
|---|---|
| `/goal` | set / resume / drop a standing goal (a carried goal starts paused) |
| `/goals` | active goals from the kernel |
| `/next` | surface one concrete next micro-step from your active goals |
| `/now` | execute items in the Now column — agent picks up whatever you put there |
| `/plan` | show the agent's current task plan (todo list) |
| `/planmode` | enforced plan mode — write tools blocked until /planmode approve |
| `/boundary` | mark a task boundary — archive the current task state and begin fresh |
| `/where` | show last stated intent and recent tool call breadcrumb |
| `/wm` | view or add to session working memory (cleared each session) |

## Model & config

| Command | Description |
|---|---|
| `/model` | change provider & model — interactive picker |
| `/models` | list available models for the active provider |
| `/effort` | set model effort for this session |
| `/setup` | configure the model backend — opens the provider/model picker |
| `/config` | interactive settings — view + change config (TUI) |
| `/settings` | show/edit persisted settings |
| `/usage` | token usage + context fill for this session |
| `/update` | git pull the latest Vanta (then ./install.sh to rebuild) |

## Tools, skills & knowledge

| Command | Description |
|---|---|
| `/tools` | list available tools |
| `/skills` | list learned + installed skills |
| `/memory` | tell Vanta something to remember (→ its brain) |
| `/moim` | pin a top-of-mind note injected into every prompt until cleared |
| `/context` | visual context-budget breakdown |
| `/compress` | compact the conversation context now |
| `/compact` | compact context now (alias of /compress; optional steer) |
| `/hooks` | list, add, or remove shell hooks in .vanta/hooks.json |
| `/mcp` | MCP panel — servers + connection status, per-server tools, tool detail, reconnect (TUI) |
| `/permissions` | tighten-only tool permission rules (~/.vanta/permissions.tsv) |
| `/preferences` | export operator preference signals (~/.vanta/preferences.jsonl) |

## Deep work

| Command | Description |
|---|---|
| `/ultrathink` | deep-reasoning mode — plan, weigh tradeoffs + edge cases, then act |
| `/ultracode` | multi-agent coding push — decompose, parallel subagents, verify, synthesize |
| `/deep-research` | fan-out research — multi-source search, skeptic-verify, cited synthesis |
| `/skeptic` | adversarially verify a claim — refute by default, demand evidence |
| `/brief` | JARVIS-style today brief — tasks, goals, calendar, episodic |
| `/review` | review changed code for bugs and cleanups (low\|medium\|high) |
| `/simplify` | reuse/simplify/efficiency/altitude pass on changed code |
| `/auto` | auto-minimalism mode — do the least that works (stdlib&gt;deps, deletion&gt;addition); 'review' audits a diff for deletable code |
| `/verify` | run the app and confirm a change actually works |
| `/repro` | save a diagnostic repro bundle to .vanta/repro-*.md |
| `/summary` | summarize this session (what was done, what remains) |
| `/audit` | run npm audit + dependency checks |

## Operator views

| Command | Description |
|---|---|
| `/world` | view Vanta's world model — entities + relationships across your systems |
| `/money` | Money OS ledger — offers, prospect pipeline, revenue total |
| `/radar` | Opportunity radar — scored opportunities ranked by pain + buyer signal |
| `/team` | background worker roster — named agents, roles, status, blockers |
| `/lifesearch` | search across Vanta's local stores (world/money/radar/team/errors) — source-cited |
| `/compartments` | Vanta's self-repair body map — compartments + max autonomy per part |
| `/locks` | regression locks — verified behaviors + passing/regressed status (verification organ) |
| `/reach` | internet-reach doctor — each channel's active backend + status + the exact fix per gap |
| `/cookie` | show login-walled reach channels with a stored cookie + the export guide |
| `/dashboard` | live operator state — tasks, goals, repo, model |
| `/health` | capability health — gmail/search/vision/browser/mcp + the exact fix for each gap |
| `/today` | today brief — tasks, goals, calendar, episodic |

## Files, edits & input

| Command | Description |
|---|---|
| `/files` | list files in the current conversation context |
| `/open` | open a file:line in your editor ($VANTA_EDITOR/code) |
| `/edit` | edit the last AI response in your editor ($VANTA_EDITOR/code) |
| `/diff` | show uncommitted changes (working tree + staged) |
| `/changes` | review changed files — per-file keep/undo (TUI) |
| `/search` | search conversation history for a term |
| `/image` | attach an image for your next message |
| `/paste` | attach an image from the clipboard (macOS) |
| `/attachments` | show or clear pending image attachments |
| `/add-dir` | add a directory to this session's readable/writable scope |
| `/import` | import config/skills from a backup archive |

## Project & lifecycle

| Command | Description |
|---|---|
| `/init` | generate a project context file for future sessions |
| `/roadmap` | open the drag-and-drop roadmap board |
| `/loops` | live loops + escalations dashboard (TUI) |
| `/cron` | list scheduled tasks |
| `/tasks` | operator task stack — /tasks next for the best move |
| `/branch` | create or switch git branch (kernel-gated) |
| `/routes` | show provider routing config (main + named VANTA_ROUTE_* overrides) |
| `/rename` | rename the current session |
| `/lint` | run the code-size gate on changed files |

## Sessions & continuity

| Command | Description |
|---|---|
| `/sessions` | list saved sessions |
| `/resume` | load a past session into this conversation |
| `/handoff` | copy-paste handoff packet (goals, git, files, next step) |
| `/bug` | record a structured bug with session + git context |
| `/copy` | copy the last response to the clipboard |

## UI

| Command | Description |
|---|---|
| `/cockpit` | open mission-control — kernel verdict ladder, goals, loops (TUI) |
| `/tui` | TUI renderer info; /tui fullscreen confirms alt-screen mode |
| `/focus` | toggle focus view — hide tool events, show only user + final responses |
| `/composer` | input box position: float (default) or bottom-pinned |
| `/output-style` | control response verbosity |

## Other

| Command | Description |
|---|---|
| `/agents` | background task panel — agent/shell/remote tasks, status, stop/respawn (TUI) |
| `/btw` | ask a quick side question — not added to conversation history |
| `/nd` | executive-function support gates — view/toggle/tune the ND gate set |
| `/recover` | classify trouble — targeted bug, polluted context, or wrong assumption |
| `/run` | launch and drive this project's app |
| `/sandbox` | sandbox settings — config, dependencies, doctor, per-tool overrides (TUI) |
| `/stats` | aggregate usage — sessions, turns, tool calls, tokens/cost (TUI) |
| `/status` | kernel, provider, keys, store health |
| `/vim` | toggle vi-mode in the composer (normal/insert: hjkl, w/b, dd, yy, p, i/a/o) |

