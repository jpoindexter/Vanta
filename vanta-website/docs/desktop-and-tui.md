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

Vanta includes a native Electron app for macOS with sessions, chat, model switching, approvals, canvas, project files, a kernel-gated terminal, tray controls, and the mobile companion bridge. The workspace is fixed to one viewport: the header and composer stay pinned while only genuine content lists scroll.

```bash
cd vanta-ts
npm run desktop:native  # build and launch from source
npm run desktop:dist    # signed ARM64 .app, .dmg, and .zip under release/
npm run desktop:release # sign, notarize, staple, and Gatekeeper-check the DMG
```

The installed app asks for a working folder and remembers it. If that folder has no model configuration, **Configure model** writes a private `.vanta/.env` from inside the app; API keys are never rendered back into the interface. **Vanta → Open Project…** (`⌘O`) switches roots later.

The macOS build bundles the renderer, TypeScript runtime, and Rust safety kernel, so it does not need a Vanta checkout. `npm run desktop:dist` uses an available Developer ID certificate by unique hash and leaves a clearly labelled unsigned local build when none exists. For public distribution, first store credentials with `xcrun notarytool store-credentials vanta`, then run `npm run desktop:release`. The release command signs the DMG container, waits for Apple acceptance, staples and validates the ticket, and requires Gatekeeper to report `Notarized Developer ID`. Set `VANTA_DESKTOP_NOTARY_PROFILE` to use a profile name other than `vanta`.

[Download the notarized Vanta v0.9.2 DMG](https://github.com/jpoindexter/Vanta/releases/download/v0.9.2/Vanta-0.9.2-arm64.dmg). SHA-256: `ca3e3143fc56685acd9d37d1bb62c6566000e2639144e72279601ba8b12c47fb`. The public checksum and fresh-Mac Gatekeeper receipt are attached to the release and its [verification run](https://github.com/jpoindexter/Vanta/actions/runs/29249460403).

## Voice, sight & desktop control

Beyond text, Vanta can take voice in and act on the screen. Each is opt-in and configured by the setup wizard, which also walks you through the one-time macOS permissions.

- **Voice input** — hold-to-talk in the composer; speech is transcribed locally on your machine (no audio leaves the device).
- **Native desktop control** — Vanta can see the screen and click / type / scroll to drive native apps, not just the browser. It works by capturing the screen, grounding the target on-screen, and actuating — or by routing through an external computer-use server.
- **Terminal capture** — read a live terminal pane's contents into context, so Vanta can act on what a long-running command is printing.
- **Channel autocomplete** — type `#` in the composer to pick a Slack channel.

## Accents

The TUI uses a small set of Vanta accent colors (focus / health / activity / goal / risk) applied to symbols over a mostly-monochrome surface — no theme system to configure.
