---
id: commands-list
title: Command reference
sidebar_position: 4
---

# Command reference

Every slash command, generated from the command catalog — **156 commands**. Type any of these in an interactive session; `/help` prints the live list.

## Session & history

| Command | Description |
|---|---|
| `/help` | show this command list |
| `/clear` | start a fresh conversation (keeps the session log) |
| `/reset` | start a fresh conversation (alias of /clear) |
| `/history` | show this conversation's transcript |
| `/export` | export this conversation — format, tool/thinking toggles, file or clipboard |
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
| `/effort` | set supported model effort |
| `/setup` | open setup or inspect one setup area |
| `/config` | interactive settings — view + change config (TUI) |
| `/settings` | show/edit persisted settings |
| `/usage` | token usage + context fill for this session |
| `/update` | git pull the latest Vanta (then ./install.sh to rebuild) |

## Tools, skills & knowledge

| Command | Description |
|---|---|
| `/tools` | list available tools |
| `/skills` | list skills, audit injection flags, or review staged agent skill changes |
| `/memory` | browse memory files, or save a fact to Vanta's brain |
| `/moim` | pin a top-of-mind note injected into every prompt until cleared |
| `/context` | visual context-budget breakdown |
| `/compress` | compact the conversation context now |
| `/compact` | compact context now (alias of /compress; optional steer) |
| `/hooks` | list, add, or remove shell hooks in .vanta/hooks.json |
| `/mcp` | MCP panel — servers + connection status, per-server tools, tool detail, reconnect (TUI) |
| `/permissions` | tighten-only tool permission rules (~/.vanta/permissions.tsv) |
| `/preferences` | inspect and correct Vanta's operator beliefs |

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
| `/search` | full-text search this session's transcript — ranked matches + highlighted snippets |
| `/image` | attach an image for your next message |
| `/look` | capture native macOS screen context for the next message |
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
| `/activity` | who/what/why timeline over the event log — /activity [--who tool] [--kind gate\|tool\|note] [--risk ask\|blocked] [--since 2h] [--limit N] [text] |
| `/agents` | custom agent editor — model, tools, color, markdown file (TUI) |
| `/autonomy` | show the acts-alone / queues / wakes-me contract |
| `/bg` | detach/check the active response in the background (TUI) |
| `/bgtasks` | background shell tasks — list status, stop one by id |
| `/blueprint` | preview a form-driven schedule or webhook automation |
| `/btw` | ask a quick side question — not added to conversation history |
| `/cd` | change the session working directory for shell_cmd (no arg prints it) |
| `/checkpoint` | snapshot the full conversation state under a name |
| `/describe` | generate a short LLM description of a file or directory |
| `/diagnose-crash` | diagnose a pasted macOS/iOS/build crash log with cited evidence |
| `/doctor` | health plus read-only context weight, duplicate rules, and cleanup candidates |
| `/env` | session-scoped env vars injected into shell_cmd/run_code child processes |
| `/explain` | capability-preservation surface — what changed + why, with a comprehension probe on risky/large changes |
| `/fast` | toggle fast mode — same model, faster output, premium rate |
| `/feedback` | draft a redacted GitHub issue from feedback/feature requests; `send` files it |
| `/home` | operator home — workflows, channels, skills, tasks, memory, watchers, setup |
| `/init-verifiers` | detect the project's build/test/lint/typecheck gates → verifier skills it can run to check its work |
| `/integrations` | integration catalog — truthful state, setup and test actions |
| `/learn` | build a skill from a doc/URL — distills, gates, and saves an editable SKILL.md |
| `/learning` | self-learning loop status — skills minted/refined/adopted + adoption rate |
| `/learnings` | per-project learnings index — relevant insights, stale/conflicting flagged |
| `/less-permission-prompts` | scan the session for repeatedly-approved read-only tools and propose allow rules to cut future prompts (propose-only) |
| `/loop` | schedule a recurring task from a natural-language interval (e.g. every 2 hours &lt;task&gt;, daily, every monday) |
| `/model-settings` | review or save model effort and speed |
| `/nd` | executive-function support gates — view/toggle/tune the ND gate set |
| `/operator-spine` | read-only tasks, tickets, schedules, sessions, runs, approvals, and receipts |
| `/outreach` | authorized brand workspace — pending drafts + the proof ledger (draft-only, approval-gated) |
| `/peers` | live Vanta peer sessions on this machine (UDS) — id, title, pid for cross-session collab |
| `/planv2` | plan mode v2 — fan a task out across N concurrent plan-execution agents (VANTA_PLAN_V2_AGENT_COUNT, 1-10) |
| `/plugin-panels` | open data-only panels contributed by isolated plugin workers (TUI) |
| `/proactive` | proactive-autonomy mode (KAIROS) — whether idle ticking is enabled, the throttle, and would-it-tick-now (read-only) |
| `/prompt` | switch the session's operating prompt preset |
| `/record` | record terminal output to an asciicast v2 .cast file under ~/.vanta/recordings |
| `/recover` | classify trouble — targeted bug, polluted context, or wrong assumption |
| `/reload-plugins` | re-scan enabled plugins and load any added this session — reports newly available vs already loaded |
| `/reload-skills` | re-scan skill directories and pick up any added this session — reports added vs already-indexed vs removed |
| `/restore` | restore a checkpoint in place, or branch it into a new session |
| `/run` | launch and drive this project's app |
| `/sandbox` | sandbox settings — config, dependencies, doctor, per-tool overrides (TUI) |
| `/schema-quality` | show exact, partial, untested, and contradicted model quality |
| `/schema-recovery` | show the latest model counterexample and its safe next action |
| `/screenshot` | copy the current Vanta transcript to clipboard as a PNG image |
| `/searchall` | search across all saved sessions (TUI) |
| `/security-review` | security audit of the current branch's diff vs base (injection/secret/authz/traversal/exec/SSRF) |
| `/skillify` | distill this session into a draft SKILL.md (write_skill saves it — not auto-written) |
| `/spec-to-app` | build a verified React/Tailwind preview from a product spec |
| `/speed` | set supported provider speed |
| `/stats` | aggregate usage — sessions, turns, tool calls, tokens/cost (TUI) |
| `/status` | kernel, provider, keys, store health |
| `/stop` | graceful soft-stop — finish the current tool call, then end the turn with a summary |
| `/suggest` | recap + ranked next-step (top 3); '/suggest all' for the full backlog |
| `/support` | set current capacity and task support without diagnostic labels |
| `/teams` | interactive team roster — create workers, manage status, inspect assigned tasks |
| `/terminal-setup` | print the steps to bind Shift+Enter → newline for your detected terminal (iTerm2/Apple Terminal/VS Code/WezTerm) |
| `/tickets` | issue board — first-class tickets grouped by status, with goal/parent links + inbox state |
| `/time` | session elapsed + time since last action (ND-TIME-RANGES) |
| `/vim` | toggle vi-mode in the composer (normal/insert: hjkl, w/b, dd, yy, p, i/a/o) |
| `/wftasks` | workflow run task list — compose_workflow runs + their running/done/failed status |
| `/what-can-i-do` | show concrete runnable workflows for this Vanta install |
| `/workflow-select` | choose, skip, reorder, and run steps from .vanta/workflow-draft.json |
