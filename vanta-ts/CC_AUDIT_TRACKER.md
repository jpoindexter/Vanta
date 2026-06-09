# CC Source Audit Tracker — HONEST STATUS
Updated: 2026-06-09 after hill-climb verification pass

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
- [s] tools/ (184 files — all 41 subdirs listed; BashTool, AgentTool, FileEditTool key files read)
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
  - permissions/ [~] (24 files — bashClassifier, dangerousPatterns, denialTracking, PermissionMode, filesystem read)
  - plugins/ [s] (44 files — installedPluginsManager, dependencyResolver, marketplaceManager read)
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
- Dirs with key files confirmed: 11  
- Dirs sampled (≥20%): 8
- Files confirmed low-signal without reading: ~200 (types, formatters, re-exports, test helpers)
- Cards added this full audit: 102 new roadmap items

## What could still be missed
- BashTool/ remaining ~15 files (modeValidation, pathValidation, commentLabel, commandSemantics, etc.)
- FileEditTool/ internals (FileEditTool.ts, utils.ts)
- services/api/ remaining files (withRetry, sessionIngress, usage, etc.)
- utils/plugins/ remaining ~30 files
- commands/ — sampled ~60 of 80+ subdirs, remainder are mostly stubs/ant-only

## Stopping condition
- 3 consecutive passes finding 0-2 new high-signal cards
- Current pass 3 found 13 new cards → continue next wake
