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
- **Quiet trace** — repeated reads and searches collapse into one completed receipt. `Ctrl+T` opens the complete stored tool evidence; failures keep the exact cause and one recovery action. Predicted next prompts are opt-in, so they do not compete with the operator's task by default.
- **Status footer** — context gauge (`48k/200k [██░░] 24%`), live timer, the working-goal `◇` line, and prefix hints (`/` commands · `@` files · `!` shell · `#` memory).
- **Approval prompt** — a per-tool numbered menu (Yes / Yes-don't-ask-again / No / Never); a kernel **block** is never offered as allowable.
- **Focus** — Tab / Shift+Tab traversal across composer, overlays, and approval actions.
- **Overlays** — `/cockpit` (kernel verdict ladder + live goals + loops), `/context`, `/loops`, `/changes`, styled `/goals`.

### Mission-control shell (opt-in)

`VANTA_TUI=v2` selects a mission-control frame with durable-state and safety / working-memory / telemetry rails around the same engine.

### Keybindings

Chords are configurable via `~/.vanta/keybindings.json` (zod-validated, fail-soft); `VANTA_SPINNER` picks the busy animation.

## The desktop app

Vanta includes a native Electron app for macOS with sessions, chat, model switching, approvals, canvas, project files, a kernel-gated terminal, tray controls, and the mobile companion bridge. Its shell follows the Keelhouse agent workflow in a Codex-style workbench: project and task history on the left, one primary agent conversation, model and context controls in the composer, and contextual outputs on demand. The workspace is fixed to one viewport; the titlebar and composer stay pinned while only genuine content lists scroll.

The contextual inspector starts closed and opens for files, output review, Canvas, preview, or terminal work. At compact widths it becomes a drawer. Pane widths are bounded, resizable, and persisted without letting the central task surface collapse.

The model picker searches by provider or model, marks the active and saved-default models separately, accepts a typed model ID, and can refresh the authenticated provider's live model list. The generated catalog remains the offline fallback, so a temporary provider failure does not remove model selection.

Session management is recoverable by default. Archive and Trash actions show pending, success, or error feedback with Undo; deleting from the main rail moves a session to Trash without losing its transcript. Permanent deletion is available only from Trash and requires confirmation. **Select chats** supports Shift-click ranges and bulk archive, restore, Trash, or permanent-delete actions. Session menus close on outside click and support arrow-key traversal plus Escape focus return.

Project context opens from the composer paperclip or an empty-draft `@`. The picker separates files changed in the working tree, files mentioned in the active task, and recently modified files, with project-wide search. Gitignored and credential-like paths are hidden by default. Selected files appear as removable chips and are submitted through the shared `@path` context expansion contract.

Connect reports models, capabilities, and messaging adapters as **Ready**, **Needs setup**, or **Unavailable**. Ready providers and adapters have safe local test actions; provider tests resolve the configured model without inference, and messaging tests verify required local settings without sending a message. Secrets remain write-only. Startup errors open model setup only for provider failures, while project file/catalog failures stay in scoped local recovery.

MCP connectors use the same project registry in CLI, TUI, and Desktop. The TUI `/mcp` panel displays shared trust/auth/enablement and persisted tool/resource inventory while its reconnect action refreshes the registry and receipt ledger. Desktop exposes the same contract on loopback-only `GET/POST /api/connect/mcp`; the Connect control-center UI builds on that boundary rather than maintaining a second MCP store.

The desktop app backlog lives in the single product roadmap, not in a separate side plan. Desktop cards include `DESKTOP-CODEX-KEELHOUSE-SHELL`, `DESKTOP-MODEL-PICKER-UX`, `DESKTOP-RUN-RECOVERY-TIMELINE`, `DESKTOP-CONTEXT-ATTACHMENTS`, `DESKTOP-SAFE-SESSION-OPS`, `DESKTOP-CONNECT-SETUP-STATUS`, `DESKTOP-CONTEXT-LEGIBILITY`, and `DESKTOP-FLOW-PROOF-SUITE`.

```bash
cd vanta-ts
npm run desktop:native  # build and launch from source
npm run desktop:dist    # signed ARM64 .app, .dmg, and .zip under release/
npm run desktop:release # sign, notarize, staple, and Gatekeeper-check the DMG
npm run desktop:flow:proof # source + signed packaged desktop acceptance matrix
```

Run `npm run desktop:flow:proof` before a desktop release. It executes the same cold-start, work/approval, failed-run recovery, attachment, archive-Undo, Outputs, Connect, and responsive-layout flows against source Electron and the packaged `Vanta.app` at `1440x960`, `1024x640`, and `760x700`.

Run `npm run desktop:visual:proof` and `npm run desktop:performance:proof` for the release regression boundary. The visual proof compares 36 Ghost light/dark captures. The packaged performance proof measures startup, first visible result, memory, CPU, and package size; startup regression uses the median of three fresh-profile launches, and every sample must remain below the 10-second hard ceiling.

The installed app asks for a working folder and remembers it. If that folder has no model configuration, **Configure model** writes a private `.vanta/.env` from inside the app; API keys are never rendered back into the interface. **Vanta → Open Project…** (`⌘O`) switches roots later.

The macOS build bundles the renderer, TypeScript runtime, and Rust safety kernel, so it does not need a Vanta checkout. `npm run desktop:dist` uses an available Developer ID certificate by unique hash and leaves a clearly labelled unsigned local build when none exists. For public distribution, first store credentials with `xcrun notarytool store-credentials vanta`, then run `npm run desktop:release`. The release command signs the DMG container, waits for Apple acceptance, staples and validates the ticket, and requires Gatekeeper to report `Notarized Developer ID`. Set `VANTA_DESKTOP_NOTARY_PROFILE` to use a profile name other than `vanta`.

[Download the notarized Vanta v0.9.4 DMG](https://github.com/jpoindexter/Vanta/releases/download/v0.9.4/Vanta-0.9.4-arm64.dmg). SHA-256: `f9556698e3a5bc5b2b5679f919238f924c19b366c366b2122aa8324a9eb301a3`. Apple accepted submission `374f7536-59ba-4657-a437-b6d151d81445`; the exact public download passed checksum, staple, signature, quarantine, and Gatekeeper verification in [clean-Mac run 29691840769](https://github.com/jpoindexter/Vanta/actions/runs/29691840769).

## Voice, sight & desktop control

Beyond text, Vanta can take voice in and act on the screen. Each is opt-in and configured by the setup wizard, which also walks you through the one-time macOS permissions.

- **Voice input** — hold-to-talk in the composer; speech is transcribed locally on your machine (no audio leaves the device).
- **Native desktop control** — Vanta can see the screen and click / type / scroll to drive native apps, not just the browser. It works by capturing the screen, grounding the target on-screen, and actuating — or by routing through an external computer-use server.
- **Terminal capture** — read a live terminal pane's contents into context, so Vanta can act on what a long-running command is printing.
- **Channel autocomplete** — type `#` in the composer to pick a Slack channel.

## Accents

The TUI uses a small set of Vanta accent colors (focus / health / activity / goal / risk) applied to symbols over a mostly-monochrome surface — no theme system to configure.
