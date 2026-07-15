# Vanta Desktop Shell Convergence

Updated 2026-07-14. This compares the current Vanta desktop renderer, the sibling Keelhouse workbench, and current Hermes Desktop. It recommends one Vanta shell and records what the prototype intentionally extracts or rejects.

## Evidence Pin

| Product | Revision | Desktop host | Evidence used |
| --- | --- | --- | --- |
| Vanta | `1866a987685c` | Electron 43 + React 19 | `vanta-ts/desktop-app`, packaged screenshots, desktop smoke scripts |
| Keelhouse | `8db54f9a357a` | Tauri 2 + React 19 | `app/src/App.tsx`, `useWorkbenchLayout.ts`, workbench components and CSS |
| Hermes | `46e87b14fd6c` (`0.17.0`) | Electron 40 + React 19 | `apps/desktop/DESIGN.md`, `AppShell`, `PaneShell`, chat/sidebar/composer/right-rail sources, repository screenshots |

Hermes was fast-forwarded from `3b2ef789d` before this review. The comparison is source-grounded, not based only on the older screenshots.

## Decision

Build Vanta Desktop as a **chat-first operator workbench**:

1. Hermes supplies the information architecture: chat is home, product nouns are durable destinations, short configuration tasks use overlays, and tool panes never steal focus.
2. Keelhouse supplies the workbench mechanics: pane-aligned native chrome, persisted resizing, project/task grouping, and an editor/browser/files/Git tool tray.
3. Vanta supplies the product identity: controlled execution, explicit approval mode, model/provider routing, Canvas, outputs, receipts, and remote operator status.

Do not replace Vanta with Hermes and do not copy Keelhouse's monolithic `App.tsx`. Extract shell contracts, then adapt Vanta state into them.

## Comparative Findings

| Concern | Current Vanta | Keelhouse | Hermes | Best Vanta choice |
| --- | --- | --- | --- | --- |
| Home surface | Work/Outputs/Connect, but Work can still feel empty | Code task and tool workbench | Chat is explicitly the home surface | Keep Work as chat home; open tools only from task context |
| Left navigation | One project, flat sessions | Project-first grouped tasks and drawer modes | Projects, source-grouped sessions, pinning, virtualized history | Project groups with compact task rows; pin/archive through explicit menus |
| Window chrome | Custom Electron titlebar | Native Tauri overlay aligned to panes | Electron overlay with measured OS control clearances | Pane-aligned chrome with OS-safe insets and one shared layout controller |
| Center surface | Simple transcript and activity list | Centered agent run with coding tools | Rich transcript, status stack, queue/steer, approvals | Rich Vanta run timeline inside a capped reading column |
| Right tools | Canvas/Preview/Files/Terminal rail | Files/Editor/Browser/Git/Split tray | Preview/Files/Review/Terminal panes | Contextual Files/Preview/Receipts/Terminal; add Editor/Git only for code tasks |
| Pane behavior | Bounded two-side resizing | Persisted left/right/bottom/hidden layouts | Generic multi-pane shell, hover reveal, bottom-row terminal | Shared pane primitive with persistent size, collapse, overlay, and bottom-row support |
| Model choice | Searchable grouped picker | Runtime-oriented model controls | Session-scoped picker, visibility, fallback models | Session model in composer; provider-grouped search; defaults remain in Settings |
| Setup | Connect plus settings | Workbench settings destination | Skills, Messaging, Artifacts plus route overlays | Keep Connect outcome-oriented; use overlays for short setup and a page for deep settings |
| Trust | Kernel chip and approval overlay | Agent status and local tools | Approval mode, inline approval, gateway readiness | Put approval mode in titlebar and risky actions inline with one-step receipts |
| Responsive behavior | Drawers below breakpoints | Adaptive single-column fallback | Force-collapsed hover/overlay panes | Sidebar -> drawer; inspector -> overlay; transcript never falls below 380px |

## Extract From Hermes

- **Chat is home.** Transcript and composer remain the primary surface.
- **Durable nouns.** Work, Outputs, and Connect stay visible instead of hiding inside settings.
- **Context-preserving navigation.** Background completion updates badges and receipts without replacing the foreground task.
- **Composer status stack.** Model, approval mode, attached context, queued instruction, voice, and run state stay near the input.
- **Contextual panes.** Tool output offers an action to open Preview/Files/Terminal; it never opens a pane automatically.
- **Session organization.** Group tasks by project and source, retain search, pinning, archive, and explicit row actions.
- **Overlay ownership.** Model picker, command palette, approvals, and short setup flows have one stacking contract.
- **Flat design system.** Whitespace and hairlines create hierarchy; nested card stacks do not.

## Extract From Keelhouse

- **One workbench layout controller** for titlebar, drawer, transcript, tool tray, and status bar.
- **Persisted pane sizing** with pointer and keyboard resizing.
- **Pane-aligned titlebar regions** so chrome reflects the workspace below it.
- **Project/task rail** as the core object model rather than a global undifferentiated session list.
- **Files, editor, browser, Git, and split tools** behind one tool-tray contract.
- **Responsive tray placement** with right, left, bottom, and hidden modes.
- **Stable mounted tools** so hiding a terminal or preview does not destroy state.

## Keep From Vanta

- Work / Outputs / Connect vocabulary.
- Kernel status and approval boundary.
- Provider-complete model routing and session-scoped model selection.
- Canvas, generated outputs, changed files, and receipts.
- Remote reach, agents, scheduling, messaging, and background work status.
- Current Electron packaging until a measured Tauri migration proves a user or maintenance benefit.

## Reject

- Hermes branding, hero artwork, pets, and its full destination count.
- Hidden gestures such as shift-click as the only way to pin.
- A permanently open empty inspector or a raw wall of project paths.
- Copying Keelhouse's large application component into Vanta.
- A new dashboard or command center competing with the transcript.
- Automatic pane opening, focus stealing, or approval bypass to appear faster.
- Fixed pane widths that break at compact window sizes.

## Prototype

Open [`docs/design-refs/vanta-desktop-shell-convergence.html`](../design-refs/vanta-desktop-shell-convergence.html).

The standalone prototype exercises:

- project/task switching;
- Work, Outputs, and Connect destinations;
- collapsible and resizable project and tool panes;
- Files, Preview, Receipts, and Terminal tool tabs;
- searchable provider-grouped model selection;
- context attachment chips;
- inline approval decisions;
- command palette, light/dark appearance, and compact responsive drawers;
- a simulated queued run that produces a receipt without navigating away.

It is a product-flow prototype, not production integration. It does not prove Vanta runtime behavior, native Electron chrome, persistence across relaunch, accessibility with assistive technology, or packaged-app performance.

## Production Architecture

Extract these components behind Vanta-owned interfaces:

```text
DesktopHost
  AppChrome
  WorkbenchLayout
    ProjectTaskRail
    AgentRunSurface
    ContextToolTray
    StatusBar
  OverlayHost
    ModelPicker
    CommandPalette
    ApprovalPrompt
    SetupFlow

VantaDesktopAdapter
  sessions
  messages and run events
  models and providers
  approvals and kernel status
  artifacts, files, Canvas, receipts, terminal
  remote reach, agents, schedules, messaging
```

The shell owns geometry, focus, keyboard routing, pane persistence, and responsive collapse. The Vanta adapter owns data and commands. Neither layer imports the other's internal state stores.

## Delivery Order

1. Extract a shared `WorkbenchLayout` and pane contract from the proven Keelhouse behavior.
2. Move Vanta's current titlebar, project/task rail, transcript, and contextual rail onto that contract without changing runtime APIs.
3. Adopt Hermes' composer status stack and inline run/approval timeline using Vanta events.
4. Replace raw Files with Recent, Changed, Mentioned, and Search; attach files as removable context chips.
5. Prove source and signed-package behavior at 1440x960, 1024x700, 760x700, keyboard resize, 200% zoom, and long-session content.

The first production slice is complete only when the actual signed Vanta application, not this HTML, can resize, collapse, restore, switch tasks, run one provider-backed task, handle an approval, and review its output without losing context.
