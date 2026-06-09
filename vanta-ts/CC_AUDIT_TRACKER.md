# CC Source Audit Tracker — FINAL
Completed: 2026-06-09 — all top-level domains audited

## Top-level files — CONFIRMED
- [x] QueryEngine.ts — QueryEngine class, ask(), QueryEngineConfig
- [x] Task.ts — Task base type
- [x] Tool.ts — Tool interface, ToolUseContext, ToolPermissionContext, buildTool
- [x] commands.ts — REMOTE_SAFE_COMMANDS, BRIDGE_SAFE_COMMANDS, filterCommandsForRemoteMode
- [x] context.ts — getClaudeMds, getMemoryFiles, git context, MAX_STATUS_CHARS=2000
- [x] cost-tracker.ts — total cost, per-model usage, cache tokens, tool duration
- [x] costHook.ts — cost hook integration
- [x] dialogLaunchers.tsx — dialog launchers
- [x] history.ts — 100-entry conversation history with PasteStore for large pastes
- [x] ink.ts — Ink React exports
- [x] interactiveHelpers.tsx — interactive helpers
- [x] main.tsx — main entry point (4683 lines)
- [x] projectOnboardingState.ts — onboarding wizard steps
- [x] query.ts — query engine (1729 lines)
- [x] replLauncher.tsx — REPL launcher
- [x] setup.ts — session setup, release notes check, terminal backup restore
- [x] tasks.ts — getAllTasks() registry
- [x] tools.ts — tools registry (389 lines)

## Directories — ALL CONFIRMED
- [x] assistant/ — session history pagination API
- [x] bootstrap/ — global singleton state
- [x] bridge/ — CCR bridge, trusted device, work secret
- [x] buddy/ — companion sprite (5 files)
- [x] cli/ — CLI handlers
- [x] commands/ — all ~80 command subdirs sampled
- [x] components/ — covered prior session
- [x] constants/ — betas, cyberRisk, outputStyles, toolLimits, spinnerVerbs
- [x] context/ — notifications, overlay, stats, mailbox, fps, voice
- [x] coordinator/ — coordinator mode
- [x] entrypoints/ — init, SDK types, sandbox types
- [x] hooks/ — all major hooks covered (2 passes)
- [x] ink/ — covered prior session
- [x] keybindings/ — all 14 files
- [x] memdir/ — all 8 files
- [x] migrations/ — config migrations (schema changes only, no new features)
- [x] moreright/ — stub (internal only)
- [x] native-ts/ — color-diff, file-index
- [x] outputStyles/ — 1 file
- [x] plugins/ — builtin plugins scaffold
- [x] query/ — stopHooks, tokenBudget, config
- [x] remote/ — all 4 files
- [x] replLauncher.tsx — covered
- [x] schemas/ — hooks schema
- [x] screens/ — Doctor, REPL, ResumeConversation
- [x] server/ — all 3 files
- [x] services/ — all major subdirs covered (2 passes)
- [x] skills/ — all files
- [x] state/ — AppStateStore, AppState
- [x] tasks/ — all task types
- [x] tools/ — all 40+ subdirs sampled
- [x] types/ — textInputTypes, plugin, hooks, ids
- [x] upstreamproxy/ — relay, upstreamproxy
- [x] utils/ — all subdirs covered (4 passes)
- [x] vim/ — all 5 files
- [x] voice/ — 1 file

## Violations remaining: 0
## Total cards added this session: 90+
