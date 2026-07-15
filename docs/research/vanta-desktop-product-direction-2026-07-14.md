# Vanta Desktop Product Direction

Updated 2026-07-14. This is the product contract behind the full desktop concept at `docs/design-refs/vanta-desktop-shell-convergence.html`.

Design-engineering audit and responsive evidence: `docs/research/vanta-desktop-design-audit-2026-07-14/design-audit.md`.

## Decision

Vanta Desktop should be a **chat-first operator workbench**:

- Keelhouse supplies the scalable shell: project/task organization, persistent resizable panes, files, diffs, browser preview, terminal, and dense native chrome.
- Hermes supplies the interaction quality: chat as home, a capable composer, visible context, progressive tool steps, focused setup flows, and flat visual hierarchy.
- OpenClaw supplies operator reach: explicit agent/host/folder targets, durable background tasks, agent and node routing, channels, automations, and push-based completion.
- Vanta supplies the product boundary: kernel gating, approval contracts, trust ledger, receipts, goals, roadmap, memory, skills, multi-provider routing, and remote execution.

The product is not a dashboard with chat attached. The transcript is the work surface; every other surface helps the operator aim, supervise, verify, or reconnect that work.

## Evidence Pins

| Product | Revision/source | Evidence used | Extracted behavior |
| --- | --- | --- | --- |
| Vanta | `1866a987`, Electron 43 + React 19 | current desktop renderer, runtime adapter, roadmap | approvals, receipts, outputs, provider routing, memory, goals, remote reach |
| Keelhouse | `8db54f9a357a`, Tauri 2 + React 19 | `App.tsx`, `useWorkbenchLayout.ts`, tool panes | persistent workbench geometry, project/task ownership, files/diff/browser/terminal |
| Hermes | `46e87b14fd6c` (`0.17.0`) | `DESIGN.md`, `AppShell`, `PaneShell`, chat, composer, settings | chat-first IA, status stack, contextual panes, overlays, setup UX |
| OpenClaw | official GitHub and Control UI docs, checked 2026-07-14 | Control UI, tasks, runtime, channels | target row, background task ledger, agents, nodes, channels, push completion |

Official OpenClaw sources:

- https://github.com/openclaw/openclaw
- https://docs.openclaw.ai/web/control-ui
- https://docs.openclaw.ai/automation/tasks

## Information Architecture

Four durable destinations are enough:

1. **Work** — sessions grouped by project, the active transcript, run steps, approvals, and the composer.
2. **Operate** — active/background tasks, spawned agents, schedules, goals, nodes, and intervention controls.
3. **Outputs** — artifacts, changed files, previews, research, receipts, and source sessions.
4. **Connect** — providers/models, skills, MCP/tools, messaging channels, memory, voice, and remote runtimes.

Settings, model selection, command palette, keyboard shortcuts, and new-session targeting are overlays because they are short tasks, not destinations.

## Shell Contract

```text
DesktopHost
  NativeChrome
  ActivityRail
  ContextSidebar
  WorkSurface
    Transcript
    RunTimeline
    ApprovalCheckpoint
    ComposerTargetRow
    Composer
  WorkbenchTray
    Activity
    Files
    Diff
    Preview
    Terminal
  StatusBar
  OverlayHost
```

The shell owns geometry, focus, keyboard routing, responsive collapse, and persisted pane sizes. A Vanta adapter owns data and commands. This keeps a future Electron-to-Tauri decision separate from the product UX.

## Critical Flows

### Start work

New task -> choose agent, execution host, project folder, optional worktree, model, and approval mode -> send first instruction -> session is created and the turn starts in one round trip.

### Supervise a run

The user message appears immediately -> named steps stream -> long work becomes a durable background task -> consequential actions pause with exact preview -> operator allows, edits, or rejects -> completion returns to the transcript and creates a receipt.

### Verify output

Run summary -> changed files/diff/preview/terminal open in the contextual tray -> receipt records model, tools, approvals, tests, and source session -> restore checkpoint remains available.

### Reach Vanta anywhere

Connect a channel or node -> bind it to an agent and allowlist -> inbound work creates or resumes the right session -> background completion is pushed to the origin -> the desktop Operate view shows the same task ledger.

## Progressive Disclosure

- The default Work screen shows the transcript, target row, and one compact activity summary.
- Tool panes open only by explicit user action or a clear output link.
- Operate shows exceptions and active work first; completed history is collapsed.
- Connect uses category rows and detail panes instead of one scrolling settings wall.
- Advanced model/provider controls live in searchable overlays.

## Prototype Coverage

The concept demo includes:

- Work, Operate, Outputs, and Connect destinations;
- project-grouped sessions with rename, archive, and delete/undo flows;
- a target-aware composer for agent, host, folder, worktree, model, and approval mode;
- visible run steps, backgrounding, cancellation, approval, and receipt flows;
- agent, task, schedule, goal, node, provider, skill, tool, channel, and memory surfaces;
- Files, Diff, Preview, Terminal, and Activity tools;
- searchable model picker and command palette;
- dark/light modes, resizable panes, compact layouts, and mobile pane navigation.

The data is illustrative. The demo does not prove production runtime wiring, persistence, assistive-technology behavior, signed-package behavior, or provider-backed execution.

## Production Delivery Order

1. Extract Keelhouse's workbench sizing and pane contracts into host-neutral modules.
2. Move Vanta's current Work transcript and project sessions onto the shell without changing runtime APIs.
3. Implement the target row and new-session transaction.
4. Bind Vanta run events to the timeline, background-task rail, approval checkpoints, and receipts.
5. Move files, diff, preview, terminal, and activity into the shared tray contract.
6. Build Operate, Outputs, and Connect from existing Vanta commands and status APIs.
7. Prove the actual signed app at 1440x960, 1024x700, 760x700, 320px reflow, 200% zoom, keyboard-only navigation, and one real provider-backed run.
