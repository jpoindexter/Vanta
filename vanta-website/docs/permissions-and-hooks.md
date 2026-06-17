---
id: permissions-and-hooks
title: Permissions & hooks
sidebar_position: 3
---

# Permissions & hooks

How approvals are decided beyond the kernel verdict, and how to fire your own automation around the agent's lifecycle.

## Permission modes

Every action is first classified by the kernel ([allow / ask / block](./safety-model.md)). For `ask` actions, a permission layer decides whether to prompt:

- **default** — prompt on every `ask`.
- **auto** (`--permission-mode auto`, `VANTA_AUTO_MODE`) — a classifier auto-allows read-only actions and applies soft-deny presets; a kernel **block** is still immovable.

```bash
vanta auto-mode defaults     # see the built-in classification
vanta auto-mode config       # view/adjust rules
```

Resolution order for an `ask` action: kernel verdict → permission rules → auto-mode → **operator-profile preferences** (which can only *preserve or tighten*, never loosen). Persisted tool-scoped allow/deny rules come from the approval prompt's "always / never" choices.

## Operator profile & preference signals

`~/.vanta/operator-profile.json` holds declared vs inferred preferences (autonomy, scope, detail, risk) and tighten-only approval preferences. Human approve/deny decisions are appended to `~/.vanta/preferences.jsonl` (chosen-vs-rejected), which the profile can read to infer more conservative behavior. `/preferences export` prints them.

## Shell hooks

Fire external commands around the agent lifecycle via `.vanta/hooks.json`:

| Event | Fires |
|-------|-------|
| `Setup` / `SessionStart` | session bootstrap |
| `PreToolUse` | before a tool runs (non-zero exit **blocks**, fail-closed, after the kernel gate) |
| `PostToolUse` | after a tool runs |
| `UserPromptSubmit` | on each prompt |
| `Stop` | when the agent stops |

Hook context is passed on stdin as JSON; tool events support a regex matcher and `maintenance` / `sessionType` filters.

## Lifecycle flags

```bash
vanta --init          # run Setup hooks before the session
vanta --init-only     # run Setup + SessionStart, then exit
vanta --maintenance   # add maintenance context for Setup hooks
```

## In-process hooks (plugins)

Plugins can register JS hooks on an in-process bus — e.g. a `message_display` hook that rewrites or suppresses output before render (raw text stays in the transcript). Distinct from the external shell-hooks engine. See [Plugins](./plugins.md).
