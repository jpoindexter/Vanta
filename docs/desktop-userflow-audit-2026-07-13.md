# Vanta Desktop User-Flow Audit and Reset Plan

Updated 2026-07-13. Scope: the native Electron desktop application from launch through first task, active work, session reuse, output review, setup, and recovery.

## Decision

Do not add another desktop destination or another inspector tab. The current app has the necessary pieces, but they are arranged as several competing shells. The desired direction is a quiet Codex-inspired work surface: compact navigation, a central transcript, and a useful output/context rail. First repair the renderer boot failure, then make Vanta one work loop:

1. Start or resume work.
2. See what Vanta is doing and decide on risky steps.
3. Review the resulting files, previews, and receipts.
4. Configure tools or channels only when that work requires it.

The target is a focused local operator, not a copy of Hermes and not a general dashboard.

## Roadmap Consolidation

Updated 2026-07-14: this audit is no longer a separate desktop backlog. The remaining desktop app work now lives in the single product roadmap, `roadmap.json`, under these cards:

- `DESKTOP-MODEL-PICKER-UX` — searchable grouped model picker with current/default clarity.
- `DESKTOP-RUN-RECOVERY-TIMELINE` — durable run timeline, classified failures, and retry failed step.
- `DESKTOP-CONTEXT-ATTACHMENTS` — files as searchable task context instead of raw project inventory.
- `DESKTOP-SAFE-SESSION-OPS` — archive undo, recoverable trash, and operation feedback.
- `DESKTOP-CONNECT-SETUP-STATUS` — outcome cards and test actions for providers, tools, and messaging.
- `DESKTOP-CONTEXT-LEGIBILITY` — model scope, tools, memory, approvals, and context chips inline.
- `DESKTOP-FLOW-PROOF-SUITE` — source and packaged-app desktop acceptance coverage across core flows and sizes.

Use the roadmap for sequencing and status. Keep this document as evidence and rationale only.

## Evidence and Method

This review applied `flow-app-shell`, `flow-navigation`, `flow-ai-chat`, and `flow-errors`, plus the design principles of progressive disclosure, recognition over recall, visible agent state, and keyboard accessibility.

Evidence includes the current renderer and route code, isolated Electron launch, existing smoke scripts, the user-provided desktop screenshots, and the current UX regression tests. The audit does not claim a user study or full accessibility review.

### Executed checks

| Check | Result | What it establishes |
| --- | --- | --- |
| `npm run typecheck` | Passed before this audit repair | Core TypeScript sources compile. It does **not** replace the renderer-specific check. |
| `npm run desktop:renderer:typecheck` | Passed after the repair | The Electron renderer source now type-checks independently. |
| `npm run desktop:operator-flows:smoke` | Passed | An isolated native window executes Work, Connect, capabilities, messaging save, Outputs, visible/removable file context, Queue-next, Stop, shortcuts, settings, light mode, and keyboard/pointer pane resizing without renderer errors. |
| `VANTA_DESKTOP_LIVE_PROOF=1 npm run desktop:live-turn:proof` | Passed | The signed ARM64 package, isolated project/profile, and local Codex provider returned `DESKTOP_LIVE_OK` in 6.4 seconds. The command refuses provider use unless explicitly opted in. |
| `npm run desktop:layout:smoke` | Passed | A wide work/recovery layout and 760px Files drawer contain long file names without document or horizontal overflow. |
| Signed arm64 `Vanta.app` + `desktop:operator-flows:smoke` | Passed | The packaged Electron app passes the same operator workflow after deep macOS signature verification. First-run status/tools setup failures are accepted only while the visible provider setup flow succeeds. |
| Isolated Electron launch with a temporary Vanta home and profile | Initially failed: `theme is not defined`; now renders `.app-shell` after the repair | Confirms the boot failure and the narrow source-renderer repair. |
| Existing session management smoke | Covers rename, archive, restore, and delete mechanics | It does **not** cover recovery, undo, keyboard focus, or the user-facing information scent. |

## Current Journey Diagnosis

### P0 - source desktop could fail before a user saw the app (repaired)

`DesktopOverlays` reads `theme` and `changeTheme` without receiving either value. The identifiers exist only inside `AppShell`, so an actual source Electron launch raises `theme is not defined` and leaves the window blank. See [App.tsx](../vanta-ts/desktop-app/src/App.tsx#L110-L141).

`tsconfig.json` includes only `src`, so `npm run typecheck` does not catch renderer errors under `desktop-app/src`. See [tsconfig.json](../vanta-ts/tsconfig.json). Vite transpiles this path but does not provide the required type gate.

**Executed repair:** theme state is passed into `DesktopOverlays`, `desktop:renderer:typecheck` includes `desktop-app/src`, and native smoke captures renderer errors. This area remains protected by the new renderer typecheck; it is no longer the active user-flow blocker.

### 2026-07-13 Implementation Update

The desktop now uses three primary destinations: **Work**, **Outputs**, and **Connect**. At normal desktop widths, a compact Outputs rail stays visible beside the central work stream, matching the useful context density of Codex Desktop without reproducing its branding. The header inspector control is a visible toggle; at narrower widths the rail becomes a drawer.

The desktop shell no longer relies on fixed wide-screen pane widths. Sessions and Outputs have bounded, draggable, keyboard-adjustable separators; their widths persist locally, the central work surface retains a 380px minimum, and the responsive drawer behavior remains in force below 1080px. Source and signed-package operator smoke both exercise keyboard and pointer resizing. The package signing flow uses the pinned Developer ID hash because the local keychain contains two certificates with the same display name; the verified bundle has Team ID `5352PXMNV5` and hardened runtime enabled.

The Work surface consumes the desktop's existing SSE channel. Text deltas render as a temporary assistant message and the five most recent tool/run events remain visible in the conversation; the final API result remains the saved conversation record. The signed-package live proof now exercises the real provider path. On an empty composer, `@` opens the file attachment drawer and `/` opens quick actions; selected files appear as removable context chips and submit through Vanta's existing `@file` syntax.

### P1 - chat is a request/response form, not an agent-work surface

The user message is optimistic, and the final assistant response is saved when `/api/chat` resolves. During the active turn, Work shows streamed text, compact named run activity, Stop, and one bounded Queue-next instruction. A failed result retains partial text and exposes Retry; scoped approval remains rendered through the existing kernel approval overlay. See [state.ts](../vanta-ts/desktop-app/src/state.ts), [chat.tsx](../vanta-ts/desktop-app/src/chat.tsx), and [App.tsx](../vanta-ts/desktop-app/src/App.tsx).

True in-turn model steering and a durable run timeline remain future improvements. They are not required for the shipped one-work-loop contract: queueing is serial, bounded to one next instruction, and never bypasses the active kernel-gated session.

**Partial change delivered:** Work consumes text and tool SSE updates, visual activity appears in the central transcript rather than only after completion, and Stop aborts the active agent signal. A Stop receipt is visible, and any streamed partial text is retained as the interrupted result.

**Follow-up:** enrich run evidence and context search without adding a new primary destination.

### P1 - too many top-level modes compete with the work loop

The left side mixes four application destinations with the session list; the header adds a kernel chip, model button, sound, help, settings, and command palette; the chat adds a four-tab inspector. Selecting a non-chat destination removes the inspector and changes the shell again. See [chat.tsx](../vanta-ts/desktop-app/src/chat.tsx#L24-L45), [App.tsx](../vanta-ts/desktop-app/src/App.tsx#L36-L72), and [rail.tsx](../vanta-ts/desktop-app/src/rail.tsx#L16-L32).

The problem is not that any one feature is wrong. The problem is that all features demand equal navigation weight before the user has completed a task. This is extraneous cognitive load and weak information scent.

**Required change:** use three stable sidebar destinations:

| Destination | Contains | Does not contain |
| --- | --- | --- |
| Work | sessions, conversation, active run, approvals, attached context | global setup and raw project dumps |
| Outputs | artifacts, previews, changed files, receipts, run history | messaging credentials |
| Connect | tools/skills, providers, messaging channels, setup status | ordinary chat history |

Settings moves to a bottom-pinned utility action. The command palette remains an accelerator, not navigation. The inspector becomes contextual: Preview appears only when a preview exists; Files opens from the composer as an attachment picker; Terminal opens only from an explicit work action.

### P1 - connection and task errors are not recoverable in the place they occur

Initial data loading treats failure of any one of status, sessions, tools, files, or models as a global desktop error. The banner offers Configure model and Retry even when the broken dependency might be the file listing or session store. See [state.ts](../vanta-ts/desktop-app/src/state.ts#L27-L50) and [App.tsx](../vanta-ts/desktop-app/src/App.tsx#L102-L108).

During a task, a thrown error is inserted as if it were an assistant response, with no retry, error class, or explanation of whether work completed. See [state.ts](../vanta-ts/desktop-app/src/state.ts#L207-L211).

**Required change:** load independent areas independently. Keep Chat available when a noncritical catalog fails; show a scoped inline banner with the affected feature, cause when known, and one next action. Preserve partial agent output and show `Retry failed step`, not a generic assistant bubble. Do not claim an action completed until the receipt confirms it.

### P1 - project files are exposed as a raw inventory, not usable context

The Files rail renders up to 220 raw paths with no filtering, grouping, search, recent context, or selected-state chips. See [rail.tsx](../vanta-ts/desktop-app/src/rail.tsx#L79-L87). This explains the user-reported panel that looks like a broken wall of file names, including metadata and tool configuration rather than task-relevant files.

**Required change:** replace the rail tab with an attachment flow opened from the composer. Start with Recent, Mentioned in this task, Changed by Vanta, and Search project. Exclude ignored/private metadata by default, show the selected file as a removable context chip, and expose the path only as supporting detail.

### P2 - session management exists but lacks safety and feedback

Rename, archive, restore, and delete are implemented in an overflow menu, but delete uses an immediate native confirmation rather than recoverable deletion. There is no optimistic pending state, completion feedback, undo, outside-click close, or durable archive/trash destination. See [chat.tsx](../vanta-ts/desktop-app/src/chat.tsx#L52-L105).

**Required change:** archive immediately with an Undo toast; make delete move to a recoverable trash. Keep rename inline. Add explicit save/error feedback and keyboard/outside-click handling for the overflow menu.

### P2 - agent context and model scope are insufficiently legible

The empty state gives useful starter prompts, but files, tools, memory, model scope, and active permissions are mostly invisible until a user opens other panels. Model scope is available in the picker, while the header exposes only a model label. See [chat.tsx](../vanta-ts/desktop-app/src/chat.tsx#L149-L172), [overlays.tsx](../vanta-ts/desktop-app/src/overlays.tsx#L62-L79), and [App.tsx](../vanta-ts/desktop-app/src/App.tsx#L88-L97).

**Required change:** render visible, removable context chips in the composer; state the active model and scope in the chat header; show approval and tool-use details inline in the run rather than requiring a rail switch.

### P2 - layout containment is better, but interaction ownership is still inconsistent

The app correctly constrains the outer window and makes sidebar, chat, rail, and operator views independently scrollable. But at desktop width it starts with three panes, then switches to a different two-pane shell on non-chat views. The default Canvas rail takes significant width even when no canvas exists. See [styles.css](../vanta-ts/desktop-app/src/styles.css#L27-L33), [styles.css](../vanta-ts/desktop-app/src/styles.css#L86-L103), and [App.tsx](../vanta-ts/desktop-app/src/App.tsx#L60-L71).

**Revised direction from the Codex Desktop reference:** at wide desktop width, default to sidebar, central work, and a compact Outputs rail so recent artifacts and activity remain discoverable. The rail must be toggleable. At narrower widths, retain the existing overlay behavior; Preview, Files, Canvas, and Terminal remain contextual rather than becoming primary destinations.

## Target Flows

### 1. Start or resume work

1. Vanta opens to Work with the most recent session selected or a short empty state.
2. The user sees one focused prompt field, the selected project, model, and any active context chips.
3. A user can start from a useful starter prompt, select a recent session, or attach a project file.
4. Sending creates an in-thread run card immediately. The send button becomes Stop; the user can queue or steer the task.
5. Tool steps and approval requests appear in the same work stream. Completion surfaces changed files, preview, and receipts with an Open output action.

### 2. Recover from a setup or execution problem

1. Vanta keeps the shell and current draft visible.
2. The affected surface names the problem in user terms, says what remains available, and offers one correct action.
3. Provider setup opens only when a provider is actually missing; file/catalog failures do not send the user to provider setup.
4. A failed agent step preserves partial work and offers Retry failed step, Edit request, or Start a new run from the checkpoint.

### 3. Review and reuse output

1. The user opens Outputs after a run or from the sidebar.
2. Outputs group artifacts by recent run, with Changed files, Preview, Links, and Receipts as filters.
3. Selecting an item opens a contextual inspector or the originating session, without changing the app's primary shell.
4. The user can attach an output to a new task, restore a checkpoint, or open the source session.

### 4. Connect capability only when needed

1. Connect shows outcome-oriented setup cards such as `Send messages from Telegram`, `Use project skills`, and `Choose a provider`.
2. Each card shows ready, needs setup, or unavailable, plus the one next action.
3. Credentials are entered once, stored locally, and never displayed. A save outcome states whether the adapter is ready and how to test it.

## Delivery Plan

### Phase 0 - stop the boot failure and make it impossible to hide

- Pass theme state into `DesktopOverlays` correctly.
- Add `desktop:renderer:typecheck` that includes `desktop-app/src`.
- Make every Electron smoke fail on renderer `pageerror`, console error, missing `.app-shell`, or failed readiness endpoint.
- Keep the current Vanta app process untouched; run all new smoke coverage with an isolated profile and temporary project.

**Exit criterion:** a fresh source Electron window renders Work and opens Appearance settings without errors; the renderer typecheck and boot smoke fail if this regresses.

### Phase 1 - establish the work loop

- Stream message text and live tool-step events directly in Work.
- Keep one bounded next instruction behind the active kernel-gated run; show the queued receipt, Stop, approval, and run activity inline. True in-turn steering remains a future model capability, not a mislabeled queue.
- Preserve partial results and give every failed run a retry action.
- Move active model, model scope, and attached context into the work header/composer.

Executed evidence: the source and locally signed arm64 package operator-flow smokes start a run, queue one next instruction, verify the visible receipt, select and remove a context chip, and stop the active run. The opt-in signed-package proof then runs a real local-Codex turn from an isolated project/profile. Scoped approval has dedicated renderer and server tests.

**Exit criterion:** a provider-backed task that reads, edits, tests, and asks for an approval remains understandable at every step; the user can stop it, queue one follow-up, approve/reject it, leave Outputs, and return without losing progress.

### Phase 2 - collapse navigation and contextualize the inspector

- Replace Chat/Capabilities/Messaging/Artifacts with Work/Outputs/Connect.
- Keep Sessions inside Work, settings in the sidebar footer, and command palette as an optional accelerator.
- Remove the default empty Canvas rail. Open Preview, context files, and Terminal only from their related action.
- Convert Files from raw list to searchable context attachment with chips.

**Exit criterion:** at a normal desktop width, the first view has one main task surface and no more than three primary destinations. A new user can find a previous session, attach a file, and reach outputs without guessing.

### Phase 3 - make management safe and setup legible

- Add archive undo and recoverable session trash; add pending, success, and error feedback to session operations.
- Make Connect status outcome-oriented, with an explicit test action after credentials save.
- Separate global defaults from per-session model choice in visible copy and state.
- Add accessible menu, dialog, focus-return, and reduced-motion checks.

**Exit criterion:** rename, archive, restore, delete, provider setup, and adapter setup all have a usable success, error, and recovery state without silently losing work or secrets.

### Phase 4 - prove the flows, then package

- Add Playwright Electron flows for cold start, work/run/approval, failed run recovery, file attachment, session archive undo, outputs, connector setup, and resize at 1440x960, 1024x640, and 760x700.
- Add a small human acceptance script with the same flows and task-success measures.
- Run source and packaged-app smoke separately; verify the packaged app only after the source flow suite is green.

**Exit criterion:** the release candidate passes the automated suite and a fresh-context operator can complete one useful bounded task in under two minutes without assistance.

## Priority Order

1. P0 renderer boot and renderer typechecking.
2. In-thread agent progress, Stop, and failure recovery.
3. Three-mode information architecture and contextual inspector.
4. Files as context, not a dump.
5. Safe session management and connector feedback.
6. Visual polish only after the above behavior is proven.

## Non-goals

- Do not import Hermes branding, artwork, or all of its settings surface.
- Do not add a fourth primary destination, a dashboard grid, or a second command center.
- Do not weaken Vanta's kernel approval boundary to make the UI appear faster.
- Do not call the desktop flow complete based only on a build, screenshot, or TypeScript result.
