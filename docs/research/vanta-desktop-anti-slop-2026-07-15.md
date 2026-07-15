# Vanta Desktop anti-slop design pass

Date: 2026-07-15

Reset point: `desktop-pre-anti-slop-2026-07-15` (annotated tag pushed before this pass).

## Product decision

Vanta Desktop is an operator workbench, not a generic AI dashboard. The visual anchor is a live run record: the user request, Vanta's response, tool steps, approvals, recovery state, and proof all stay in one readable vertical flow. Keelhouse supplies the project-first shell hierarchy; Vanta supplies the run evidence and safety contract.

## Removed generic signals

- Redundant in-app VANTA title and rounded V mark in the macOS titlebar.
- Boxed status-pill treatment and decorative dashboard card language.
- Avatar tiles and generic hero copy in favor of role labels and a run record.
- Unbounded composer width and loose control grouping.
- Docked source DevTools behavior that could leave a blank black half-window.
- Titlebar controls entering the macOS traffic-light zone.

## Added product-specific decisions

- Project and task hierarchy stays in the left rail.
- Work is the default focused surface; Operate, Outputs, and Connect are explicit destinations.
- The right inspector is contextual and edge-owned, with Activity, Files, Diff, Preview, and Receipts tabs.
- The composer carries execution context, model, approval mode, attachments, and commands in one functional row.
- The statusbar reports Gateway, Kernel, task count, project root, and branch context.
- Source DevTools are explicitly detached; the renderer must retain the full BrowserWindow content width.
- Dark and light themes share the same semantic tokens and layout contract.

## Verification ledger

Executed against the current source renderer and Electron shell:

- `npm run desktop:renderer:typecheck` — passed.
- `npm run desktop:shell-convergence:smoke` — passed Work/Operate/Outputs/Connect, new task, inline approval, model picker, responsive widths, titlebar safe zone, and no redundant brand.
- `npm run desktop:devtools:smoke` — passed detached `devtools://` window, 900px renderer content width, full shell width, traffic-light-safe controls at 76px, and zero titlebar brand nodes.
- `npm run desktop:layout:smoke` — passed healthy and forced recovery layouts, desktop and compact model picker, long-path files fixture, and no horizontal overflow.
- `npm run desktop:operator-flows:smoke` — passed model, connect, capabilities, messaging, outputs, attachments, queue/stop, shortcuts, settings, provider setup, light theme, and pane persistence.
- `npm run desktop:sessions:smoke` — passed rename, archive, restore, and delete.
- `npm run desktop:native:smoke` — passed renderer asset startup, packaged kernel online, terminal-love mount, and obsidian-vault mount. Codegraph remained skipped because its trust gate is external to this visual pass.

Visual receipt:

- Before: `docs/research/vanta-desktop-anti-slop-2026-07-15/screenshots/before.png`
- After: `docs/research/vanta-desktop-anti-slop-2026-07-15/screenshots/after.png`

## Remaining boundary

These checks prove the desktop shell, renderer behavior, local kernel startup, and interaction contracts. They do not prove signed distribution, notarization, or live provider-backed conversation. Those remain release proofs rather than reasons to weaken the shell design.
