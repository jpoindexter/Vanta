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
- Native fallback black showing through as an orphaned right-side slab when the shell or inspector state changed.

## Added product-specific decisions

- Project and task hierarchy stays in the left rail.
- Work is the default focused surface; Operate, Outputs, and Connect are explicit destinations.
- The right inspector is contextual and edge-owned, with Activity, Files, Diff, Preview, and Receipts tabs.
- The composer carries execution context, model, approval mode, attachments, and commands in one functional row.
- The statusbar reports Gateway, Kernel, task count, project root, and branch context.
- Source DevTools are explicitly detached; the renderer must retain the full BrowserWindow content width.
- The two project-rail controls are right-aligned within the project rail, while the native traffic lights are centered on the 50px titlebar row. The inspector toggle lives with the right-side actions it governs, not beside the model selector.
- The task model picker uses a provider index and stable model rows. It states that clicking changes the current task, the star saves a default for new tasks, and an unlisted model ID is an advanced disclosure rather than a permanent form.
- The renderer root and app shell explicitly fill `100vw`/`100dvh`; the native BrowserWindow and splash fallback use the same workspace color so uncovered resize edges do not read as broken black space.
- The Work run-control toolbar and the inspector tab tray now share one 52px chrome row, matching top and bottom baselines so the shell reads as a single aligned surface instead of two mismatched bars.
- Dark and light themes now use the corrected Vanta Ghost system: black, bone white, and neutral gray. Green, amber, and red are reserved for semantic status only; selection, navigation, focus, and actions remain monochrome. Both modes share the same semantic tokens and layout contract.

## Verification ledger

Executed against the current source renderer and Electron shell:

- `npm run desktop:renderer:typecheck` — passed.
- `npm run desktop:shell-convergence:smoke` — passed Work/Operate/Outputs/Connect, new task, inline approval, model picker, responsive widths, titlebar safe zone, and no redundant brand.
- `npm run desktop:devtools:smoke` — passed detached `devtools://` window, 900px renderer content width, full shell width, traffic-light-safe controls at 76px, and zero titlebar brand nodes.
- `npm run desktop:layout:smoke` — passed healthy, inspector-closed, and forced recovery layouts. Root, shell, titlebar, and Work all reach the right viewport edge when expected; desktop and compact model picker, long-path files fixture, and no horizontal overflow also passed.
- `npm run desktop:shell-convergence:smoke` — passed the explicit chrome-row geometry check: Work toolbar and inspector tabs both measured 52px high with a shared 102px bottom baseline.
- `npm run desktop:operator-flows:smoke` — passed model, connect, capabilities, messaging, outputs, attachments, queue/stop, shortcuts, settings, provider setup, light theme, and pane persistence.
- 2026-07-15 Ghost theme correction: `npm run desktop:renderer:typecheck`, `npm run desktop:operator-flows:smoke`, `VANTA_DESKTOP_SMOKE_PORT=7921 npm run desktop:layout:smoke`, and `npm run desktop:shell-convergence:smoke` passed. Shell convergence measured the running dark shell as `rgb(10, 10, 10)` with bone-white text `rgb(245, 245, 243)`; operator flows switched through Settings to Ghost light. All normal, muted, faint, and action text pairs measured at or above WCAG AA contrast.
- `npm run desktop:sessions:smoke` — passed rename, archive, restore, and delete.
- `npm run desktop:native:smoke` — passed renderer asset startup, packaged kernel online, terminal-love mount, and obsidian-vault mount. Codegraph remained skipped because its trust gate is external to this visual pass.

Visual receipt:

- Before: `docs/research/vanta-desktop-anti-slop-2026-07-15/screenshots/before.png`
- After: `docs/research/vanta-desktop-anti-slop-2026-07-15/screenshots/after.png`
- Model picker: `docs/research/vanta-desktop-anti-slop-2026-07-15/screenshots/model-picker-fixed.png` — 22 Codex models rendered in 48px rows; the 640x900 compact proof kept the 616x876 dialog entirely inside the viewport with no horizontal overflow.
- Ghost dark: `docs/research/vanta-desktop-anti-slop-2026-07-15/screenshots/ghost-dark.png`.
- Ghost light: `docs/research/vanta-desktop-anti-slop-2026-07-15/screenshots/ghost-light.png`.

## Remaining boundary

These checks prove the desktop shell, renderer behavior, local kernel startup, and interaction contracts. They do not prove signed distribution, notarization, or live provider-backed conversation. Those remain release proofs rather than reasons to weaken the shell design.
