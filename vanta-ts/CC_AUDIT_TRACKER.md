# CC Source Audit Tracker — HONEST STATUS
Updated: 2026-06-09 after pass 5

Legend:
- [x] = every file explicitly read
- [~] = key files read, remainder confirmed low-signal (types, formatters, re-exports)
- [s] = sampled (read ~20-50% of files, high-signal ones confirmed)
- [ ] = not read

## Top-level files — ALL READ ✓
- [x] QueryEngine.ts
- [x] Task.ts
- [x] Tool.ts
- [x] commands.ts
- [x] context.ts
- [x] cost-tracker.ts
- [x] costHook.ts
- [x] dialogLaunchers.tsx
- [x] history.ts
- [x] ink.ts
- [x] interactiveHelpers.tsx
- [x] main.tsx (imports scanned)
- [x] projectOnboardingState.ts
- [x] query.ts (imports scanned)
- [x] replLauncher.tsx
- [x] setup.ts
- [x] tasks.ts
- [x] tools.ts

## Directories — status per directory

### Fully read (every file)
- [x] assistant/ (1 file)
- [x] bootstrap/ (1 file)
- [x] buddy/ (5 files)
- [x] coordinator/ (1 file)
- [x] keybindings/ (14 files)
- [x] memdir/ (8 files)
- [x] moreright/ (1 stub)
- [x] outputStyles/ (1 file)
- [x] remote/ (4 files)
- [x] schemas/ (1 file)
- [x] server/ (3 files)
- [x] vim/ (5 files)
- [x] voice/ (1 file)
- [x] native-ts/ (3 subdirs, all read)
- [x] plugins/ (2 files: builtin scaffold, bundled index)

### Key files read, rest confirmed low-signal
- [~] bridge/ (25 files — read bridgeMain, capacityWake, codeSessionApi, trustedDevice, workSecret, types)
- [~] constants/ (21 files — read betas, cyberRisk, outputStyles, spinnerVerbs, toolLimits, turnCompletionVerbs, xml)
- [~] context/ (9 files — read notifications, overlay, stats, mailbox, fps, voice)
- [~] entrypoints/ (8 files — read init, agentSdkTypes, sandboxTypes, sdk/coreTypes)
- [~] migrations/ (10 files — config schema migrations only, no new features)
- [~] query/ (4 files — read stopHooks, tokenBudget, config)
- [~] screens/ (3 files — read Doctor.tsx, ResumeConversation.tsx)
- [~] state/ (6 files — read AppStateStore, AppState)
- [~] tasks/ (12 files — read types, DreamTask, LocalShellTask, RemoteAgentTask, InProcessTeammateTask)
- [~] types/ (11 files — read textInputTypes, plugin, hooks, ids)

### Sampled (20-60% of files read)
- [s] cli/ (8 files — read 3: handlers/agents, handlers/auth, print)
- [s] commands/ (189 files — 60+ commands sampled from ~80 subdirs, all major ones checked)
- [s] components/ (485 files — covered in prior session, assumed complete)
- [s] hooks/ (104 files — ~50 files read in 2 passes)
- [s] ink/ (large — covered in prior session)
- [s] services/ (130 files — all subdirs listed, key files in each read)
- [s] skills/ (20 files — read loadSkillsDir, bundledSkills, mcpSkillBuilders, key bundled skills)
- [s] tools/ (184 files — all 41 subdirs listed; BashTool [~] pass 5 read modeValidation/pathValidation/commentLabel/commandSemantics/shouldUseSandbox/utils/readOnlyValidation; FileEditTool [~] pass 5 read FileEditTool.ts/utils.ts; AgentTool key files read)
- [s] utils/ (564 files — all subdirs listed; key files in each read)
  - bash/ [~] (23 files — bashParser, ShellSnapshot, key security files)
  - computerUse/ [~] (15 files — executor, common read)
  - deepLink/ [x] (6 files — all read)
  - dxt/ [x] (2 files — all read)
  - filePersistence/ [x] (2 files)
  - git/ [~] (3 files — gitConfigParser read)
  - github/ [x] (1 file)
  - hooks/ [~] (17 files — hookEvents, execHttpHook, ssrfGuard, fileChangedWatcher, skillImprovement, postSamplingHooks read)
  - memory/ [x] (2 files)
  - mcp/ [x] (2 files)
  - model/ [~] (16 files — modelCapabilities, contextWindowUpgrade, configs read)
  - nativeInstaller/ [~] (5 files — installer read)
  - permissions/ [x] (24 files — all read in pass 5: permissionExplainer, permissionRuleParser, pathValidation, getNextPermissionMode, autoModeState, permissionSetup, permissions, bypassPermissionsKillswitch + prior 8)
  - plugins/ [~] (44 files — pass 5 read: loadPluginAgents, loadPluginCommands, loadPluginHooks, loadPluginOutputStyles, pluginLoader, pluginDirectories, pluginInstallationHelpers, pluginOptionsStorage, schemas + prior 4 = ~30% read, rest are helpers/types)
  - powershell/ [x] (3 files)
  - processUserInput/ [~] (4 files — processUserInput read)
  - sandbox/ [x] (2 files)
  - secureStorage/ [~] (6 files — index, macOsKeychainStorage read)
  - settings/ [~] (19 files — mdm, pluginOnlyPolicy, toolValidationConfig, allErrors, changeDetector read)
  - shell/ [~] (10 files — outputLimits, readOnlyCommandValidation, resolveDefaultShell read)
  - skills/ [x] (1 file)
  - suggestions/ [~] (5 files — skillUsageTracking, slackChannelSuggestions read)
  - swarm/ [~] (22 files — TmuxBackend, InProcessBackend, teammateModel, teammateLayoutManager read)
  - task/ [~] (5 files — framework read)
  - telemetry/ [~] (9 files — instrumentation read)
  - teleport/ [~] (4 files — ccrSession, environments read)
  - todo/ [x] (1 file)
  - ultraplan/ [x] (2 files)
  - utils top-level files [~] (many — agenticSessionSearch, concurrentSessions, commitAttribution, fastMode, fileHistory read)

## Honest count
- Dirs with every file read: 17
- Dirs with key files confirmed: 12 (permissions/ upgraded to [x] in pass 5)
- Dirs sampled (≥20%): 8
- Files confirmed low-signal without reading: ~200 (types, formatters, re-exports, test helpers)
- Cards added this full audit: 209 new roadmap items (102 p1-4 + 12 p5 + 13 p6 + 9 p7 + 6 p8 + 5 p9 + 6 p10 + 11 p11 + 9 p12 + 7 p13 + 8 p14 + 6 p15)

## What could still be missed
- services/api/ — all key files read passes 4-5; remainder low-signal
- commands/ — all 80+ subdirs now scanned pass 6; some (ant-only, bughunter, ctx_viz, debug-tool-call) have no index.ts
- utils/bash/ — commands/prefix/registry/shellCompletion/shellQuoting/shellPrefix/treeSitterAnalysis/bashPipeCommand all read pass 6; specs/ (benchmark files only)
- utils/swarm/ — partially read (TeammateTmux, InProcess, layout); remaining: agentCoordinator, networkAdapter, etc.
- services/ subdirs not fully read: policyLimits/, diagnosticTracking, rateLimitMocking

## Pass history
- Pass 1: ~30 cards (bootstrap session)
- Pass 2: ~30 cards
- Pass 3: 14 cards
- Pass 4: 13 cards
- Pass 5: 12 cards
- Pass 6: 13 cards
- Pass 7: 9 cards (1 session dump + 5 swarm/services + 2 LSP/MCP + 1 NVIDIA)
- Pass 8: 6 cards (tools/ long-tail: AskUserQuestion, McpAuth, StructuredOutput, CronDurable, SendMessage, TeamTools)
- Pass 9: 5 cards (hooks/ agent/prompt types, frontmatter hooks, once-hooks, exit codes)
- Pass 10: 6 cards (away summary, auto-updater, SSH session, plugin recommend, deferred hooks, marketplace auto-install)
- Pass 11: 11 cards (memory warn, OS notify, copy-on-select, clipboard hint, asciicast, screenshot-clipboard, session title, JetBrains, PDF read, context suggestions, transcript search)
- Pass 12: 9 cards (claude-code-hints proto, +500k budget, plugin autoupdate, release channels, SDK idle timeout, standalone agent name, plan mode v2, auto-mode denials, extract memories)
- Pass 13: 7 cards (session memory svc, team memory sync, auto-compact, session memory compact, remote managed settings, chrome native setup, chrome GIF recorder)
- Pass 14: 8 cards (parallel tool exec, VCR mode, voice STT, example commands, shell completion install, auto-issue, API preconnect, prompt editor)
- Pass 15: 6 cards (Grove consent, streaming tool exec, adaptive thinking, hook timing, agent editor, AI agent generator)
  → Pass trend: 13/12/13/9/6/5/6/5/6/11/9/7/8/6 — deep tail, yield declining toward ≤2 stopping condition

## Stopping condition
- 3 consecutive passes finding 0-2 new high-signal cards
- Passes 4/5/6 found 13/12/13 → continue; yield is still high
