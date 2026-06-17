---
id: sessions-and-continuity
title: Sessions & continuity
sidebar_position: 2
---

# Sessions & continuity

Vanta is built to survive restarts, long context, and topic shifts without silently dragging stale state forward.

## Sessions

Each session is saved as a JSON file at `~/.vanta/sessions/<id>.json` (id `YYYYMMDD-HHMMSS`, zod-validated).

```bash
vanta sessions                       # list
vanta resume <id>                    # resume history
vanta resume <id> --fork-session     # resume into a NEW session id (original untouched)
```

## Age-gated resume

A prior thread is only carried into a restart if it's recent — `VANTA_RESUME_MAX_AGE_MIN` (default 120; `0` = always start clean). This fixes "stuck on an old thread after restart."

## Carried goals (paused)

A goal from a previous session launches **paused** — Vanta won't steer toward it until you `/goal resume` or reference it. The footer's `◇` line tracks the session's actual working goal, not the kernel ledger, so a paused goal shows blank until resumed.

## Compaction & session memory

When context fills, the conversation is compacted; a forked distiller maintains a running `.vanta/session-memory.md` during the session and re-injects its interior on compaction and on resume.

## Handoff

```bash
/handoff      # write a continuity packet (goals + git + recent tools + last intent + next)
```

**Auto-handoff** writes `.vanta/handoff.md` automatically when context fill crosses `VANTA_AUTOHANDOFF_THRESHOLD` (0.75); the next interactive launch reloads and consumes it.

## Standing loops

Durable project loops persist to `.vanta/ralph-loop.json` and surface paused on launch — see [Autonomy](./autonomy.md#standing-loops-ralph).

## Lifecycle hooks

`--init` runs Setup hooks before a session, `--init-only` runs Setup + SessionStart then exits, `--maintenance` adds maintenance context. Shell hooks (`.vanta/hooks.json`) fire on Setup / SessionStart / PreToolUse / PostToolUse / UserPromptSubmit / Stop.
