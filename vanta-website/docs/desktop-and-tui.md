---
id: desktop-and-tui
title: TUI & desktop
sidebar_position: 8
---

# TUI & desktop

## The terminal UI

The default interactive surface is a React + Ink terminal UI with inline rendering and committed scrollback, so the terminal owns history (native selection, scroll, and copy).

- **Composer** — a custom readline: emacs/readline chords, multiline (shift+enter), command history with typeahead, queue-while-busy, `^G` to open `$EDITOR`, image paste, `Esc` to interrupt.
- **Transcript** — markdown + GFM tables, tool calls render as `⏺ Verb(detail)` over a dim result line with inline diffs, syntax-highlighted code.
- **Status footer** — context gauge (`48k/200k [██░░] 24%`), live timer, the working-goal `◇` line, and prefix hints (`/` commands · `@` files · `!` shell · `#` memory).
- **Approval prompt** — a per-tool numbered menu (Yes / Yes-don't-ask-again / No / Never); a kernel **block** is never offered as allowable.
- **Focus** — Tab / Shift+Tab traversal across composer, overlays, and approval actions.
- **Overlays** — `/cockpit` (kernel verdict ladder + live goals + loops), `/context`, `/loops`, `/changes`, styled `/goals`.

### Mission-control shell (opt-in)

`VANTA_TUI=v2` selects a mission-control frame with durable-state and safety / working-memory / telemetry rails around the same engine.

### Keybindings

Chords are configurable via `~/.vanta/keybindings.json` (zod-validated, fail-soft); `VANTA_SPINNER` picks the busy animation.

## The desktop app

A Vite + React desktop renderer ships under `desktop-app/` — an app shell with a session sidebar, chat thread, composer, and a right rail.

```bash
npm run desktop:build    # build the renderer (served from desktop-app/dist/)
```

## Accents

The TUI uses a small set of Vanta accent colors (focus / health / activity / goal / risk) applied to symbols over a mostly-monochrome surface — no theme system to configure.
