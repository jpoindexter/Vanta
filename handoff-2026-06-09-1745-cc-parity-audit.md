# Handoff — Claude Code Parity Audit (roadmap.json)
Generated: 2026-06-09 17:45
Project: Vanta — /Users/jasonpoindexter/Documents/GitHub/_active/Vanta
Branch: main

## What Was Accomplished

- **CC parity audit pass 1** (tools + CLI flags): 43 new cards covering tools (Monitor, WaitForMcpServers, ShareOnboardingGuide), CLI flags (--effort, --max-budget-usd, --json-schema, --fork-session, --safe-mode, --init flags, --exec, --cache-hints), session management (purge, away-recap, from-pr, autoupdate, session-cleanup), hooks system (CC-HOOK-TYPES, CC-HOOK-EVENTS, CC-HOOK-MATCHERS), and settings parity groups (UX/memory/git/MCP/skill). Committed `5c0fe0f`.
- **CC ink/components domain audit pass 1**: 43 new TUI/UI cards covering virtual list, status line richness, spinner variants (teammate tree, stalled, glimmer), 10 new message types, context visualization, per-tool permission UIs, sandbox/MCP/memory/hooks config panels, dialogs (bypass, cost threshold, token warning, export, worktree exit), design system, mouse support, text selection, alternate screen, scroll box, tab nav, terminal title. Committed `28944b8`.
- **CC ink/components follow-up (missed)**: 22 additional cards caught on second pass: structured diff renderer, syntax-highlighted code, thinking toggle, tool loader, QuickOpenDialog, settings panel, tasks panel, teams UI, trust dialog, skills menu, agent detail UI, advisor message, shutdown message, auto mode opt-in dialog, invalid settings UI, workflow multiselect, keybinding warnings, animated logo, in-TUI auto-updater, search box, bidi text, resource update message. Committed `6373e6b`.
- Roadmap HTML regenerated after each commit via `vanta-ts/src/cli.ts roadmap build`.

**Roadmap state after this session:** 474 total (285 shipped · 138 next · 51 horizon). 125 of the `next` cards are Claude Code parity cards.

## Files Changed

| File | Status | What Changed |
|------|--------|-------------|
| `roadmap.json` | Modified | +108 new CC parity cards (3 commits). Source of truth. |
| `roadmap.html` | Regenerated (gitignored) | Rebuilt after each commit — 399KB, dated 2026-06-09. |
| `DECISIONS.md` | Modified (pre-existing, not this session) | Pre-existing uncommitted edit — not this session's work. |
| `vanta-ts/src/repl-commands.ts` | Modified (pre-existing, not this session) | Pre-existing uncommitted edit — not this session's work. |

## Current State

- Build status: Not run this session (no code changes, only roadmap.json data)
- Tests: Not run (no code changes)
- Uncommitted changes: YES — `DECISIONS.md` and `vanta-ts/src/repl-commands.ts` (both pre-existing from before this session, not related to roadmap work)
- Untracked: `agent-looping-playbook.html`, `vanta-ts/PALETTE_VERIFICATION.md` (pre-existing)
- `roadmap.json`: fully committed and clean

## In Progress (not finished)

### CC parity audit — remaining source domains

The audit was structured around the CC source tree at:
`/Users/jasonpoindexter/Documents/GitHub/_active/Vanta/reference/claude-code-source/src/`

**Completed domains:**
- ✅ Tools (from prior session — 23 cards)
- ✅ CLI flags / settings (this session — pass 1)
- ✅ `ink/` + `components/` (this session — 65 cards across 2 passes)

**Remaining domains (not started):**

| Domain | Path | Key features |
|--------|------|-------------|
| `hooks/` | `src/hooks/` | Hook runtime, PreToolUse/PostToolUse payloads, JSON control fields, blocking vs non-blocking |
| `keybindings/` | `src/keybindings/` | Chord bindings, keybindings.json format, context-sensitive bindings, useShortcutDisplay |
| `skills/` + `memdir/` | `src/skills/`, `src/memdir/` | Skill invocation runtime, memory directory structure, skill frontmatter, recall patterns |
| `remote/` + `server/` | `src/remote/`, `src/server/` | Remote execution, cloud sessions, bridge API |
| `voice/` + `vim/` + `plugins/` | `src/voice/`, `src/vim/`, `src/plugins/` | Voice loop, vim mode implementation, plugin loading/registry |
| `outputStyles/` | `src/outputStyles/` | Output style system, custom personas |
| `coordinator/` | `src/coordinator/` | Agent coordinator / lead agent pattern |
| `tasks/` | `src/tasks/` | Task types, background task scheduling |
| `schemas/` | `src/schemas/` | Message/tool schemas |
| `services/` | `src/services/` | Analytics, rate limiting, auth services |
| `moreright/` | `src/moreright/` | Unknown — needs exploration |

**The process:** For each domain, read the source files in the reference repo, identify every distinct feature/capability, compare against existing roadmap cards (don't duplicate), write new cards, append to `roadmap.json`, run `roadmap build` to regenerate HTML, commit.

**The method that worked:** Open files with `find src/<domain> -type f | sort`, read key files with `head -60`, then draft cards in a Python script that appends to roadmap.json. Run a second pass after the first to catch anything missed (the `ink/components` domain needed a second pass).

## Key Decisions Made

1. **1:1 feature-to-card granularity**: Each distinct user-visible feature, tool, command, or capability gets its own card. Components that are clearly sub-implementation of an existing card get folded in (e.g., `ContextSuggestions` goes into `CC-CONTEXT-VIZ`). Judgment call each time.

2. **Status assignment**: `next` = implementable in a focused session with a clear path. `horizon` = needs significant infrastructure (mouse support, bidi text, cloud sessions, enterprise managed settings, animated logo).

3. **No duplication check is automated**: Must manually confirm an ID doesn't exist before adding. The Python script filters with `if c["id"] not in existing_ids`.

4. **HTML regeneration command**: `./vanta-ts/node_modules/.bin/tsx --tsconfig vanta-ts/tsconfig.json vanta-ts/src/cli.ts roadmap build` from repo root. NOT `tsx src/roadmap/build.ts` directly (that's just an export, not an entrypoint).

5. **Two-pass audit**: The `ink/components` domain had 485 files. First pass caught the obvious features; second pass added 22 more. Expect this pattern in large domains like `hooks/` and `plugins/`.

## Exact Next Steps (in order)

1. [ ] Open `src/hooks/` in the CC reference source and list all files: `find reference/claude-code-source/src/hooks -type f | sort`
2. [ ] Read key hook files to understand payload shapes, JSON control fields (`continue`, `stopReason`, `decision`), blocking vs async behavior
3. [ ] Compare against existing roadmap cards: `CC-HOOKS` (next), `CC-HOOKS-ENGINE` (next), `CC-HOOKS-CMD` (next), `CC-HOOK-TYPES` (next), `CC-HOOK-EVENTS` (next), `CC-HOOK-MATCHERS` (next) — identify what's still missing
4. [ ] Draft new cards, append to `roadmap.json`, regenerate HTML, commit
5. [ ] Repeat for `keybindings/` — likely yields 5–10 cards on keybindings.json format, chord bindings, useShortcutDisplay hook, context-sensitive bindings
6. [ ] Repeat for `skills/` + `memdir/` — skill invocation runtime, memory directory structure
7. [ ] Repeat for `voice/` + `vim/` + `plugins/`
8. [ ] Repeat for remaining smaller domains (`outputStyles/`, `coordinator/`, `tasks/`, `schemas/`, `services/`, `moreright/`)
9. [ ] Final pass: run `vanta roadmap prune` to check for duplicate/overlapping cards after all domains are done

## Context That's Easy to Lose

- The CC source is **compiled/transpiled** output at `reference/claude-code-source/src/`. Source maps are embedded in base64 at the bottom of files. The actual readable source is in the `sourcesContent` field of the source map. Most files are readable enough without decoding.
- `roadmap.json` uses `"items"` as the top-level array key (not `"cards"`).
- The roadmap build command must be run from the **repo root**, not from `vanta-ts/`. The CLI reads `repoRoot` from `findRepoRoot()` which looks for the `roadmap.json` at the parent of `vanta-ts/`.
- The `updated` field in `roadmap.json` should be set to today's date (`"2026-06-09"`) when editing — the Python scripts in this session did this manually.
- Pre-existing uncommitted changes in `DECISIONS.md` and `vanta-ts/src/repl-commands.ts` are unrelated to this work. Don't accidentally commit them with roadmap changes — always use `git add roadmap.json` explicitly.
- `roadmap.html` is **gitignored** — it must be regenerated locally. It's opened in the browser automatically by `vanta roadmap build`.
- The `track` for all new parity cards should be `"Claude Code parity"`.

## Continuation Prompt

Paste this into a new Claude session to resume:

---
I'm doing a Claude Code parity audit for the Vanta project at `/Users/jasonpoindexter/Documents/GitHub/_active/Vanta`. The goal is to examine the CC source reference and add a roadmap card for every feature, function, or tool that Vanta is missing or could improve on — 1:1 feature-to-card granularity.

**What's already done:**
- Tools + CLI flags domain: 43 cards added (commit `5c0fe0f`)
- `ink/` + `components/` domain: 65 cards added across 2 passes (commits `28944b8`, `6373e6b`)
- Roadmap is at 474 items (285 shipped · 138 next · 51 horizon), HTML regenerated

**The CC source reference is at:**
`/Users/jasonpoindexter/Documents/GitHub/_active/Vanta/reference/claude-code-source/src/`

**Top-level domains still to audit (in priority order):**
1. `hooks/` — hook runtime, payload schemas, JSON control fields (continue/stopReason/decision), blocking vs async
2. `keybindings/` — keybindings.json format, chord bindings, useShortcutDisplay, context-sensitive bindings
3. `skills/` + `memdir/` — skill invocation runtime, memory directory structure
4. `remote/` + `server/` — remote execution, cloud sessions, bridge API
5. `voice/` + `vim/` + `plugins/` — voice loop, vim mode, plugin loading/registry
6. `outputStyles/`, `coordinator/`, `tasks/`, `schemas/`, `services/`, `moreright/` — smaller domains

**The method:**
1. `find reference/claude-code-source/src/<domain> -type f | sort` to list files
2. Read key files with `head -60` or `Read` to understand what each feature does
3. Compare against existing roadmap cards (use `python3 -c "import json; data=json.load(open('roadmap.json')); print([i['id'] for i in data['items'] if 'HOOK' in i['id']])"` style checks)
4. Draft new cards as a Python script that appends to `roadmap.json` (filter with `if c["id"] not in existing_ids`)
5. Regenerate HTML: `./vanta-ts/node_modules/.bin/tsx --tsconfig vanta-ts/tsconfig.json vanta-ts/src/cli.ts roadmap build`
6. Commit: `git add roadmap.json && git commit -m "feat(roadmap): <domain> audit — N new cards"`

**Rules:**
- Track for all new cards: `"Claude Code parity"`
- Status: `next` for implementable features, `horizon` for complex/infrastructure-dependent
- The `"items"` key holds the array (not `"cards"`)
- Set `"updated": "2026-06-09"` when editing
- Always use `git add roadmap.json` explicitly — don't accidentally commit pre-existing changes to `DECISIONS.md` or `vanta-ts/src/repl-commands.ts`
- Do a second pass on large domains — the `ink/components` domain needed one

Start with the `hooks/` domain. List its files first, then read the key ones before drafting cards.
---
