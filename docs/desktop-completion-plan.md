# Vanta Desktop App Completion Plan

Purpose: give Claude/Cursor a clear implementation plan to turn Vanta’s local web shell into a real, functional desktop app.

Repo:

```text
/Users/jasonpoindexter/Documents/GitHub/Vanta
```

Current rough desktop files:

```text
vanta-ts/src/desktop/page.ts
vanta-ts/src/desktop/server.ts
vanta-ts/src/desktop/server.test.ts
vanta-ts/src/desktop/native-shell.md
vanta-ts/src/desktop/AGENTS.md
vanta-ts/src/desktop/CLAUDE.md
```

Current run command:

```bash
cd /Users/jasonpoindexter/Documents/GitHub/Vanta/vanta-ts
npm run vanta -- desktop
```

Current local URL:

```text
http://127.0.0.1:7790
```

---

## Executive summary

The current desktop implementation is only a rough local web shell. It has some real Vanta wiring, but it is not a complete desktop app.

The target is a real Vanta desktop interface targeting a full desktop experience, better aligned with Vanta’s identity:

- native desktop shell
- session sidebar
- central streaming chat
- approval prompts
- model picker/settings
- file/context browser
- terminal rail
- preview rail
- command palette
- command center
- memory/goals/plan visibility
- Vanta safety kernel enforced everywhere

Important: do **not** make a generic dashboard. Jason specifically rejected that. Match a full interaction model first, then improve it with Vanta’s operator/dossier aesthetic and stronger safety.

---

## Reference app to inspect first

The reference implementation is in the repo:

```text
reference/apps/desktop
reference/ui-tui
```

Reference files:

```text
reference/apps/desktop/package.json
reference/apps/desktop/src/app/desktop-controller.tsx
reference/apps/desktop/src/app/shell/app-shell.tsx
reference/apps/desktop/src/app/chat/index.tsx
reference/apps/desktop/src/app/chat/sidebar/index.tsx
reference/apps/desktop/src/app/chat/right-rail/preview-pane.tsx
reference/apps/desktop/src/app/command-palette/index.tsx
reference/apps/desktop/src/app/command-center/index.tsx
reference/apps/desktop/src/app/settings/index.tsx
reference/apps/desktop/src/app/skills/index.tsx
reference/apps/desktop/src/app/right-sidebar/terminal/persistent.tsx
```

Target desktop shape:

- Electron shell
- left session sidebar
- central assistant chat thread
- bottom composer
- top/titlebar controls
- command palette
- model picker overlay
- command center overlay
- right rail for preview/files/terminal
- settings, skills, messaging, artifacts views
- gateway event stream
- session persistence

---

## Non-negotiable Vanta constraints

Vanta has a Rust safety kernel and every action must respect it.

### Safety rules

1. All tool actions must go through the existing Vanta agent/tool dispatch or explicit kernel assessment.
2. No destructive shell commands.
3. No direct filesystem writes outside approved scope.
4. Approval-required actions must show a clear approval UI before execution.
5. Approval UI must show:
   - action
   - reason
   - tool name if known
   - Approve / Deny
6. Never silently auto-approve an `ask` action from desktop.
7. Native shell must not bypass the TypeScript tools or Rust kernel.
8. Do not edit Rust kernel files autonomously.
9. Do not modify `MANIFESTO.md`.
10. Do not commit secrets.

### Codebase conventions

- Node 22, ESM, TypeScript strict.
- Imports use `.js` extensions.
- Use zod at API/LLM boundaries.
- Files should stay small; ideally under 300 lines.
- Tests co-located.
- Verify before claiming done:

```bash
cd vanta-ts
npx vitest run
npx tsc --noEmit
```

If Rust changes are needed, stop and ask Jason first.

---

## Current state

Current command added:

```bash
vanta desktop [port]
```

Wired in:

```text
vanta-ts/src/cli.ts
vanta-ts/src/cli/ops.ts
```

Current desktop backend endpoints:

```text
GET  /
GET  /api/status
GET  /api/sessions
POST /api/sessions/new
POST /api/sessions/open
GET  /api/tools
GET  /api/files
GET  /api/models
POST /api/model
GET  /api/approval
POST /api/approval
POST /api/terminal
POST /api/chat
```

Current functionality:

- rough HTML shell
- session list/search/open/new
- central chat
- model picker overlay
- approval modal concept
- flat file list
- one-shot terminal command runner
- preview iframe
- basic command palette
- basic command center

Current problems:

- frontend is a giant embedded string in `page.ts`
- not native
- no real streaming
- no real PTY
- no real file tree
- no full preview webview
- weak session architecture
- minimal tests
- no serious UI polish
- single global server state
- desktop feature set incomplete

---

## Target architecture

Build this in layers. Do not try to ship everything in one unverified patch.

Recommended direction: **Electron first** for fastest feature parity.

Why Electron:

- Electron is the proven choice.
- Easier preview webview.
- Easier `node-pty` terminal.
- Easier native menus/window controls.
- More direct parity with the reference implementation.

Tauri can be revisited later if size/performance matters more than speed.

### Proposed structure

Add a real desktop app under:

```text
vanta-ts/desktop-app/
```

Suggested structure:

```text
vanta-ts/desktop-app/package.json
vanta-ts/desktop-app/vite.config.ts
vanta-ts/desktop-app/tsconfig.json
vanta-ts/desktop-app/electron/main.cjs
vanta-ts/desktop-app/electron/preload.cjs
vanta-ts/desktop-app/src/main.tsx
vanta-ts/desktop-app/src/app.tsx
vanta-ts/desktop-app/src/api/client.ts
vanta-ts/desktop-app/src/state/session-store.ts
vanta-ts/desktop-app/src/components/AppShell.tsx
vanta-ts/desktop-app/src/components/SessionSidebar.tsx
vanta-ts/desktop-app/src/components/ChatThread.tsx
vanta-ts/desktop-app/src/components/Composer.tsx
vanta-ts/desktop-app/src/components/RightRail.tsx
vanta-ts/desktop-app/src/components/FileTree.tsx
vanta-ts/desktop-app/src/components/TerminalRail.tsx
vanta-ts/desktop-app/src/components/PreviewRail.tsx
vanta-ts/desktop-app/src/components/CommandPalette.tsx
vanta-ts/desktop-app/src/components/CommandCenter.tsx
vanta-ts/desktop-app/src/components/ModelPicker.tsx
vanta-ts/desktop-app/src/components/ApprovalModal.tsx
vanta-ts/desktop-app/src/styles.css
```

Keep the existing `vanta-ts/src/desktop/server.ts` as the local backend initially, but refactor it into smaller modules.

Suggested backend structure:

```text
vanta-ts/src/desktop/server.ts              # route wiring only
vanta-ts/src/desktop/state.ts               # DesktopState, session maps
vanta-ts/src/desktop/routes/status.ts
vanta-ts/src/desktop/routes/chat.ts
vanta-ts/src/desktop/routes/sessions.ts
vanta-ts/src/desktop/routes/models.ts
vanta-ts/src/desktop/routes/files.ts
vanta-ts/src/desktop/routes/terminal.ts
vanta-ts/src/desktop/routes/approval.ts
vanta-ts/src/desktop/events.ts              # SSE/WebSocket stream
vanta-ts/src/desktop/terminal.ts            # PTY or command bridge
vanta-ts/src/desktop/native.ts              # shell launch helpers if needed
```

---

## Critical implementation principle

The desktop app should be a **surface**, not a second agent runtime.

Do not duplicate agent logic in the desktop app.

Use existing Vanta primitives:

```text
prepareRun
createConversation
buildSummarizer
writeRunMemory
SafetyClient
ToolRegistry
sessions/store.ts
providers/catalog.ts
setup.ts upsertEnv
```

For all agent work, call into the same conversation/tool path as CLI/TUI.

---

# Phase 0 — Clean up current rough implementation

Goal: make the current desktop code maintainable before adding more.

## Tasks

### 0.1 Split `page.ts`

Current file:

```text
vanta-ts/src/desktop/page.ts
```

Problem: giant string with HTML/CSS/JS.

If keeping local web shell temporarily, split into:

```text
vanta-ts/src/desktop/page/html.ts
vanta-ts/src/desktop/page/styles.ts
vanta-ts/src/desktop/page/client.ts
vanta-ts/src/desktop/page.ts
```

Better: move frontend into real React app under `desktop-app` and make `page.ts` only redirect or serve built assets.

Acceptance:

- no giant unreadable string file
- typecheck clean
- behavior unchanged

### 0.2 Split `server.ts`

Current file:

```text
vanta-ts/src/desktop/server.ts
```

Problem: route handling, state, approvals, terminal, sessions all in one file.

Refactor into modules listed above.

Acceptance:

- `server.ts` under 150 lines
- route modules tested individually
- `npx tsc --noEmit` clean

### 0.3 Add route tests

Add tests for:

- `eventLabel`
- session new/open
- model list/set validation
- approval lifecycle
- file listing route
- terminal route denies/asks appropriately

Do not need full browser tests yet.

Acceptance:

```bash
cd vanta-ts
npx vitest run src/desktop
npx tsc --noEmit
```

passes.

---

# Phase 1 — Streaming event channel

Goal: desktop chat must update live while Vanta is working.

Current problem:

- `/api/chat` blocks until the turn is finished.
- UI only sees events after completion.

## Recommended approach

Add Server-Sent Events first. WebSocket can come later.

Endpoints:

```text
GET  /api/events?sessionId=<id>
POST /api/chat
```

Event types:

```ts
type DesktopEvent =
  | { type: "text_delta"; sessionId: string; delta: string }
  | { type: "text_complete"; sessionId: string; text: string }
  | { type: "thinking"; sessionId: string; text: string }
  | { type: "tool_start"; sessionId: string; name: string; args: unknown }
  | { type: "tool_end"; sessionId: string; name: string; ok: boolean; output: string }
  | { type: "approval_request"; sessionId: string; approvalId: string; action: string; reason: string; toolName?: string }
  | { type: "approval_resolved"; sessionId: string; approvalId: string; approved: boolean }
  | { type: "turn_end"; sessionId: string; finalText: string; usage?: unknown }
  | { type: "error"; sessionId: string; message: string };
```

Use existing `AgentDeps` callbacks:

- `onTextDelta`
- `onEvent`
- `onToolCall`
- `onToolResult`
- `onThinking`

Acceptance:

- model text appears progressively when provider supports streaming
- tool starts/ends appear live
- approval modal appears while turn is still running
- no need to refresh after every event

Tests:

- pure event broadcaster tests
- SSE subscribe/unsubscribe tests if practical

---

# Phase 2 — Session architecture

Goal: support real session switching and multiple sessions without global state clobbering.

Current problem:

- one global `DesktopState`
- multiple tabs/windows can overwrite state
- session actions are minimal

## Backend design

Use a map:

```ts
type DesktopRuntimeSession = {
  id: string;
  started: string;
  setup: RunSetup;
  convo: Conversation;
  events: DesktopEventBroadcaster;
  pendingApproval?: PendingApproval;
  busy: boolean;
};

const sessions = new Map<string, DesktopRuntimeSession>();
```

Endpoints:

```text
GET    /api/sessions
POST   /api/sessions/new
POST   /api/sessions/open
POST   /api/sessions/rename
POST   /api/sessions/delete
POST   /api/sessions/fork
POST   /api/sessions/export
POST   /api/sessions/pin
POST   /api/sessions/archive
```

Implement in stages:

1. new/open/list
2. delete/rename/export
3. fork/branch
4. pin/archive

Acceptance:

- opening session A, then session B, then A again restores correct transcript
- two browser tabs do not corrupt each other
- sidebar selected state is correct
- session titles update from first user message or manual rename

Tests:

- session runtime map tests
- open/resume persistence tests

---

# Phase 3 — Real React renderer

Goal: replace static string UI with maintainable React components.

## App shell components

Build:

```text
AppShell
SessionSidebar
ChatView
ChatThread
Composer
RightRail
CommandPalette
CommandCenter
ModelPicker
ApprovalModal
SettingsView
SkillsView
ArtifactsView
MessagingView
```

### Layout target

```text
┌─────────────────────────────────────────────────────────────┐
│ titlebar / model / command controls                         │
├──────────────┬───────────────────────────────┬──────────────┤
│ sessions     │ chat thread                    │ right rail   │
│ search       │                               │ preview      │
│ pinned       │                               │ files        │
│ recents      │ composer at bottom             │ terminal     │
└──────────────┴───────────────────────────────┴──────────────┘
```

### Vanta styling direction

Use Jason’s preferred technical/operator style:

- dossier/operator file aesthetic
- calm mission-control, not generic SaaS
- structured panels
- visible state
- muted dark palette
- no mascot/chatbot fluff
- low cognitive tax
- compact status labels
- clear approval states

Copy the interaction model. Do not build generic SaaS branding.

Acceptance:

- user can use the UI without opening CLI
- components are readable and testable
- no giant HTML strings

---

# Phase 4 — Approval lifecycle

Goal: make desktop approval flow reliable and safe.

## Requirements

When Vanta tries an `ask` action:

1. backend pauses the tool execution
2. emits `approval_request`
3. frontend shows modal
4. user approves/denies
5. backend resumes
6. emits `approval_resolved`
7. transcript shows result

Approval modal must show:

- tool name
- action
- reason
- risk label
- buttons:
  - Deny
  - Approve once
  - optional later: Always allow this tool this session

Do **not** implement always-allow until the once flow is proven.

Tests:

- request waits until approve
- request waits until deny
- wrong approval id rejected
- no silent approval
- concurrent approval behavior defined

Acceptance:

- live manual test with an out-of-root write or risky shell command
- modal appears
- deny blocks execution
- approve executes only after confirmation

---

# Phase 5 — Model picker and settings

Goal: model selection should work reliably and persist.

Existing relevant files:

```text
vanta-ts/src/providers/catalog.ts
vanta-ts/src/providers/index.ts
vanta-ts/src/setup.ts
vanta-ts/src/status.ts
```

Known roadmap bug:

```text
UX-MODEL-FIX — model choice not sticking across relaunch
```

## Tasks

1. Audit env loading precedence:
   - `cli.ts loadEnv(repoRoot)`
   - `.env` path
   - process env overrides
2. Make model picker write `.env` correctly.
3. Refresh active provider in desktop session.
4. Show provider health/key missing state.
5. Support free-typed model ID.
6. Add settings screen for API keys without exposing secret values.

Endpoints:

```text
GET  /api/models
POST /api/model
GET  /api/settings/provider-health
POST /api/settings/provider-key
```

Be careful with secrets:

- never display key value
- only show present/missing
- writes to `.env` mode `0600`

Acceptance:

- choose model
- restart desktop
- same model active
- if key missing, UI explains clearly

Tests:

- `upsertEnv` behavior already exists; add route tests
- model persistence integration test where possible

---

# Phase 6 — File browser and context attachments

Goal: real file/context rail, not flat list.

Existing helper:

```text
vanta-ts/src/tui/at-context.ts
```

Current endpoint:

```text
GET /api/files
```

## Build

Backend:

```text
GET /api/files/tree
GET /api/files/read?path=<path>
```

Frontend:

- collapsible file tree
- search
- click file to preview
- add file to composer context
- folder attach inserts folder ref
- visual context chips

Safety:

- reads must stay inside allowed/readable zones
- do not expose secrets accidentally
- consider secret filename guard:
  - `.env`
  - `*.key`
  - `id_rsa`
  - `.mcp.json`

Acceptance:

- browse folders
- attach file context
- attached context is visible before send
- file preview works

Tests:

- tree builder pure tests
- path traversal denied
- secret-ish files not listed or require explicit approval

---

# Phase 7 — Terminal rail / PTY

Goal: real terminal rail, Vanta-safe.

Current terminal:

- one-shot `shell_cmd`
- returns full output after completion

Target:

- persistent terminal sessions
- live output
- ANSI rendering
- command input
- selection can be added to chat context

## Recommended with Electron

Use `node-pty` in Electron main process or backend process.

Architecture:

```text
renderer TerminalRail
  ⇅ IPC/SSE/WebSocket
backend/electron terminal manager
  ⇅
node-pty shell process
```

Safety model:

- Starting a command from the desktop terminal must still be assessed.
- Interactive terminal is tricky because users can type anything after shell starts.
- Safest first version:
  - keep command runner, not full shell
  - add live streaming output
- Later version:
  - full PTY but clearly mark as direct user terminal, not autonomous Vanta tool
  - Vanta cannot drive PTY without approval

Recommended phases:

1. live command output runner
2. persistent shell for user only
3. allow “add selection to chat”
4. allow Vanta-suggested command with approval

Acceptance phase 1:

- run `git status`
- output streams live
- risky command triggers approval/block

---

# Phase 8 — Preview rail

Goal: real preview rail for apps/files.

Current:

- iframe only

Target:

- URL preview
- local file preview
- console panel
- reload controls
- devtools button if Electron
- “Ask Vanta to restart preview server”

With Electron:

- use `<webview>` with isolation
- capture console messages
- capture load errors

Endpoints/tasks:

```text
POST /api/preview/restart-server
GET  /api/preview/state
```

Restart flow:

1. preview fails to load
2. UI offers “Ask Vanta to restart server”
3. backend starts an Vanta background task:
   - inspect project
   - identify dev server command
   - run safe command or ask approval
4. events stream to preview console
5. preview reloads when ready

Acceptance:

- preview a local dev server URL
- see console/log errors
- reload works
- failed server restart task is visible and honest

---

# Phase 9 — Command palette

Goal: real fuzzy command palette like VS Code.

Current:

- simple hardcoded buttons

Target groups:

- Go to
  - New session
  - Skills & Tools
  - Messaging
  - Artifacts
  - Settings
  - Command Center
- Sessions
  - fuzzy search sessions
- Models
  - change model
- Settings
  - API keys
  - MCP
  - appearance
- Tools
  - list/search tools
- Vanta actions
  - show goals
  - show plan
  - next action
  - memory note

Implement fuzzy search with a small local matcher first; no need for heavy deps.

Acceptance:

- `Cmd/Ctrl+K` opens palette
- typing filters commands/sessions/settings
- Enter runs selected command
- Esc closes

Tests:

- pure fuzzy matcher tests
- command list generation tests

---

# Phase 10 — Command Center

Goal: real command center, not skeleton.

Sections:

## Sessions

- search
- pin/unpin
- delete/archive
- rename
- export
- open

## System

- kernel status
- provider/model status
- goals
- approvals
- logs
- restart desktop backend
- update Vanta command, approval-gated if needed

## Usage

- token usage
- model usage
- cost estimates if available
- tool call counts
- skill activity

Existing useful files:

```text
vanta-ts/src/status.ts
vanta-ts/src/sessions/store.ts
vanta-ts/src/velocity/store.ts
```

Acceptance:

- command center gives a real overview of Vanta’s state
- no fake metrics
- missing data is labeled missing, not invented

---

# Phase 11 — Composer attachments and voice

Goal: make composer function like a real multimodal agent interface.

Existing Vanta capabilities:

- `/image <path>`
- `/paste`
- image attachments in TUI
- `transcribe`
- `speak`
- `look_at_screen`
- `watch_video`

Desktop composer should support:

- text
- file refs
- folder refs
- URL refs
- image picker
- clipboard image paste
- drag/drop files/images
- voice record/transcribe
- queued messages while busy

Endpoints:

```text
POST /api/attachments/image
POST /api/attachments/clipboard-image
POST /api/audio/transcribe
```

Native shell needed for best clipboard/file picker support.

Acceptance:

- drag image into composer and send
- paste clipboard image and send
- attach file context and send
- record voice and transcribe into composer

---

# Phase 12 — Native packaging

Goal: real desktop app.

## Electron package

Add:

```text
vanta-ts/desktop-app/electron/main.cjs
vanta-ts/desktop-app/electron/preload.cjs
```

Main process responsibilities:

- start/stop Vanta desktop backend
- create BrowserWindow
- app menu
- native file pickers
- clipboard image bridge
- PTY bridge if implemented
- lifecycle cleanup

Renderer:

- React app
- connects to local backend

Scripts:

```json
{
  "desktop:dev": "...",
  "desktop:build": "...",
  "desktop:start": "..."
}
```

Do not package/sign until dev app is stable.

Acceptance:

- `npm run desktop:dev` opens native window
- backend starts automatically
- quitting app stops backend cleanly

Later:

- `electron-builder`
- `.app`
- dmg/zip
- signing/notarization

---

## Suggested build order

Do this top-down.

### Slice 1 — Refactor and tests

- split `server.ts`
- split/replace `page.ts`
- add route tests

Done when:

```bash
cd vanta-ts
npx vitest run src/desktop
npx tsc --noEmit
```

passes.

### Slice 2 — SSE streaming

- event broadcaster
- `/api/events`
- live text/tool/turn events

Done when:

- chat updates live
- tool calls appear live

### Slice 3 — session runtime map

- per-session state
- robust open/new/list
- no global clobber

Done when:

- multiple sessions work reliably

### Slice 4 — React renderer

- Vite React app
- AppShell, Sidebar, Chat, Composer, RightRail

Done when:

- no giant string UI
- current functionality preserved

### Slice 5 — approval modal hardening

- tested approval lifecycle
- live manual approval works

### Slice 6 — model picker/settings

- persistent model switching
- provider health/key state

### Slice 7 — file tree/context

- collapsible tree
- preview
- attach chips

### Slice 8 — terminal rail phase 1

- live safe command runner
- later PTY

### Slice 9 — preview rail phase 1

- URL/file preview
- console/logs if Electron

### Slice 10 — command palette/command center

- fuzzy command palette
- real system/session/usage panels

### Slice 11 — native Electron shell

- dev native app opens
- lifecycle works

### Slice 12 — package/sign later

Only after Jason confirms UX is good.

---

## Testing checklist

Minimum verification each slice:

```bash
cd /Users/jasonpoindexter/Documents/GitHub/Vanta/vanta-ts
npx vitest run
npx tsc --noEmit
```

If CLI wiring changed, also manually run:

```bash
npm run vanta -- desktop
```

Manual smoke tests:

1. desktop opens
2. new session works
3. send “hello”
4. session appears in sidebar
5. open prior session
6. model picker opens
7. file rail lists files
8. terminal `pwd` works
9. risky terminal command asks/blocks
10. approval modal works
11. command palette opens with `Cmd/Ctrl+K`
12. command center opens with `Cmd/Ctrl+.`

---

## UX acceptance criteria

Jason should be able to say:

- “This feels like a real app, not a webpage.”
- “It works like a proper desktop agent, not a webpage.”
- “It looks like Vanta, not generic SaaS.”
- “I can see what Vanta is doing.”
- “Risky actions clearly ask me.”
- “Sessions and context are easy.”
- “The terminal/files/preview rails are useful.”

If any of those fail, don’t call it done.

---

## What not to do

Do not:

- keep adding hacks to the giant `page.ts`
- claim native desktop is done before Electron/Tauri exists
- bypass the kernel for terminal/file operations
- fake usage/cost metrics
- silently auto-approve actions
- build a generic admin dashboard
- ignore Jason’s requirement that it must function like a real desktop agent

---

## Final desired outcome

A native Vanta desktop app with:

- full desktop interaction model
- Vanta operator/dossier aesthetic
- safe approval-first action flow
- session continuity
- live streaming
- model control
- file/context management
- terminal and preview rails
- command palette
- command center
- enough polish that Jason can use it as the main way to work with Vanta.
