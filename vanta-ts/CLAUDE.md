# CLAUDE.md — vanta-ts (agent layer)

The TypeScript agent loop. Read root `../CLAUDE.md` for the kernel + project overview. This file is the agent layer's source of truth — don't re-read every file to learn the structure; it's mapped here.

## Runtime

Node 22, ESM, `"type": "module"`. Run via `tsx` (no build step). Native `fetch`, `process.loadEnvFile` — **no dotenv, no axios.** Relative imports use `.js` extensions (ESM convention; tsx resolves to `.ts`). **TUI** uses React 19 + real **Ink 7** (`ink: "^7.0.6"` in package.json — no fork, no vendor alias). Rendering is inline with `<Static>` for committed scrollback; no AlternateScreen, no ScrollBox, no mouse-capture/virtual-history layer. Component tests use `ui/test-render.tsx` (real Ink `render` over fake stdio, ANSI-stripped frame capture), NOT ink-testing-library. Deps: `ink`, `react`.

## File map (`src/`)

| File | Responsibility |
|------|----------------|
| `types.ts` | Core types: `Message`, `ToolCall`, `Verdict`, `Goal`, `Risk` |
| `providers/interface.ts` | `LLMProvider` interface, `ToolSchema`, `CompletionResult`. Non-streaming (see decisions) |
| `providers/openai.ts` | OpenAI **+ Ollama/Gemini/OpenRouter** (same SDK, `baseURL` swap). Converts internal↔OpenAI shapes. **`stream()`** (token deltas) + pure `foldToolCallDeltas` |
| `ui/app.tsx` | The TUI App: `<Static>` committed scrollback + live composer/status rows. Delegates state to `ui/reducer.ts`, agent I/O to `ui/use-agent.ts` |
| `ui/reducer.ts` | `State`, `Action`, `reduce` — pure reducer for the TUI transcript (tested via `reducer.test.ts`) |
| `ui/use-agent.ts` | `useAgent` hook — `sendToAgent` fn, queue-drain effect, Esc-abort `useInput`. Returns `{sendToAgent, abortRef}` |
| `ui/transcript.tsx` | Transcript row components (assistant/user/tool/note) — inline rendering, no alternate screen |
| `ui/composer.tsx` | Composer: custom readline (Ctrl+U/W/Esc-abort, up/down history, shift+enter multiline) |
| `ui/launch.tsx` | `runTui(repoRoot)` — prepareRun + maybeCurate + `render(<App/>)`. `vanta` uses it on a TTY; readline REPL is the fallback |
| `ui/test-render.tsx` | Test harness replacing ink-testing-library: `renderSync` + fake stdio (paused-mode stdin w/ `readableLength`) + a terminal-grid emulator |
| `ui/theme.tsx` | Semantic design tokens (success/error/warning/info/marker/userMarker; `primary`=text/white, identity in accent/border/marker); `VANTA_THEME` switch |
| `ui/types.ts` | UI-local types (`TuiState`, action unions, overlay descriptors) |
| `providers/index.ts` | `resolveProvider(env)` — reads `VANTA_PROVIDER`/`VANTA_MODEL`. openai/ollama/anthropic/**gemini**/**openrouter**/**claude-code** (gemini+openrouter = OpenAI adapter w/ baseURL swap; claude-code = Anthropic adapter w/ OAuth token) |
| `providers/claude-code-auth.ts` | v1 G1 — `resolveClaudeCodeToken` reads a Claude Pro/Max OAuth token (env or `~/.claude/.credentials.json`), `isTokenExpired`. **Grey area** (ToS); `VANTA_PROVIDER=claude-code`. No refresh (Claude Code keeps creds fresh). See DECISIONS 2026-06-02 |
| `providers/catalog.ts` | `PROVIDER_CATALOG` — small shared `{id,label,envVar,defaultModel,signupUrl}` list the setup wizard + `doctor` read. **Not** the full registry (deferred); extend alongside `resolveProvider` |
| `setup.ts` | `vanta setup` first-run wizard. Pure `upsertEnv(existing, updates)` (merges into `.env`, preserves other keys) + `buildEnvUpdates` + interactive `runSetup(repoRoot, rl?)` (hidden key prompt, 0600 write) |
| `status.ts` | `vanta status`/`doctor`. Pure `formatStatus(report)` + `gatherStatus(env)` (kernel **ping only**, provider try/catch, key **presence**, store/goal counts) |
| `safety-client.ts` | `fetch` client → kernel. `assess/getGoals/proposeApproval/approve/deny/logEvent/status`. Zod-validates responses |
| `kernel-launcher.ts` | `ensureKernel()` — ping, else spawn detached with `VANTA_ROOT` + cwd, poll 5s |
| `scope.ts` | `resolveInScope(target, root)` — path containment, mirrors kernel's `inside_scope` |
| `tools/types.ts` | `Tool` (schema + optional `describeForSafety` + `execute`), `ToolContext`, `ToolResult` |
| `tools/registry.ts` | `ToolRegistry`: register/get/list/schemas |
| `tools/roadmap-move.ts` | KANBAN — `roadmap_move` tool. Moves a roadmap item to a new status, writes `roadmap.json`, regenerates HTML. `describeForSafety` → kernel Allow |
| `roadmap/move.ts` | `moveRoadmapItem(repoRoot, id, toStatus)` — pure fn: read → validate → patch → write → rebuild |
| `roadmap/server.ts` | KANBAN-S2 — `createRoadmapServer(repoRoot)` (Node http) + `serveRoadmap(repoRoot, port)`. Routes: `GET /roadmap/board` (serves roadmap.html), `POST /roadmap/move` → `moveRoadmapItem`. `vanta roadmap serve` wires this |
| `tools/clarify.ts` | ND2 — `clarify` tool. Agent calls this when intent is ambiguous. Returns a formatted question (+ optional numbered choices) as `output`; the model surfaces it in its reply and awaits the next turn. End-of-turn design: no `ToolContext` changes. `describeForSafety` → "ask user a clarifying question" → kernel Allow |
| `tools/{read-file,write-file,shell-cmd,inspect-state}.ts` | The four v0 tools. `write-file` writes in-repo freely / out-of-repo only into a **writable zone**; `read-file` reads in-repo freely / out-of-repo only from a **readable zone** (both approval-gated by the kernel) |
| `tools/writable-zones.ts` | SCOPE-1/2 — `resolveWritableZones` (write_file: `~/Desktop`+`~/Downloads`, `VANTA_WRITABLE_DIRS`) · `resolveReadableZones(env,root)` (read_file: project's parent dir + writable zones, `VANTA_READABLE_DIRS`) · `isInZone`/`expandHome`. Kernel still Asks per out-of-root access; the zone lists are the backstop bounding where an approved access lands |
| `tools/{web-search,web-fetch}.ts` | Phase 2B web tools. `web-fetch` exports pure `extractReadable(html,url)` |
| `tools/{write-skill,recall}.ts` | Phase 2A learning tools. `describeForSafety` is a constant internal-op string (no path/query → kernel `Allow`) |
| `tools/{screenshot,browser-navigate,browser-extract}.ts` | Phase 3 browser tools (lazy `playwright-core`). Allowlist + `requestApproval` for new domains. `browser-extract` exports pure `extractFromHtml` |
| `tools/describe-image.ts` | Phase 3 vision — OpenAI vision model on a scoped image (`VANTA_VISION_MODEL`, default gpt-4o-mini) |
| `tools/run-code.ts` | Phase 4 — run python/node/rust in an isolated temp dir, timeout, **approval-gated** |
| `tools/lsp.ts` + `lsp/ts-service.ts` | Phase 4 — diagnostics + go-to-definition for .ts/.tsx via the **TS compiler API** (no separate language server) |
| `tools/git.ts` | Phase 4 — 6 git tools. status/diff read-only; commit/push/branch/checkout call `requestApproval` (risk:ask) |
| `browser/allowlist.ts` | `isAllowedDomain`/`extractDomain` — `VANTA_ALLOWED_DOMAINS` gate for browser tools |
| `providers/anthropic.ts` | Phase 4 full Anthropic adapter (lazy `@anthropic-ai/sdk`, default `claude-sonnet-4-6`). Pure `toAnthropicMessages` |
| `tools/delegate.ts` | Phase 6 — spawns a scoped subagent. Child registry excludes `delegate` (no runaway recursion) |
| `schedule/cron.ts` | Phase 6 — `isDue` (5-field cron) + `.vanta/cron.tsv` load/add/save |
| `schedule/runner.ts` | Phase 6 — `runDueTasks({dataDir, now, run})` runs due active tasks; one failure doesn't abort the batch |
| `schedule/commands.ts` | Phase 6 — `vanta schedule`/`cron` CLI handlers (extracted to keep cli.ts ≤300) |
| `gateway/run.ts` | v1 E1/E2/E3 — `vanta gateway` daemon: `gatewayTick` (cron) + `pollPlatform` (messaging) + webhook listener, in one `runGateway` loop (SIGINT/SIGTERM-clean). `VANTA_GATEWAY_TICK_MS` |
| `gateway/webhook.ts` | v1 E3 — pure `verifyGithubSignature` (HMAC sha256, constant-time) + `resolveDeliver` (local/file/telegram) + `startWebhookServer` (POST, HMAC-gated, 200-fast). `VANTA_WEBHOOK_PORT`/`_SECRET`/`_PROMPT`/`_DELIVER` |
| `service/launchd.ts` + `service/manager.ts` | v1 E1 — pure `buildLaunchdPlist` + `vanta service install\|uninstall\|status` (launchd user agent that keeps `vanta gateway` alive; captures PATH). macOS only for now |
| `gateway/platforms/base.ts` | v1 E2 — `PlatformAdapter` contract (`connect`/`disconnect`/`send`/`poll`) + `InboundMessage`/`OutboundMessage`. One adapter per messaging platform |
| `gateway/platforms/telegram.ts` | v1 E2 — `TelegramAdapter` (getUpdates long-poll + sendMessage, no SDK) + pure `parseUpdates`/`parseAllowlist`. `gateway/run.ts pollPlatform` runs inbound→agent→reply. Enabled by `VANTA_TELEGRAM_TOKEN`; offline-tested, live needs a @BotFather token |
| `mcp/client.ts` | v1 E5 — dependency-free MCP stdio JSON-RPC client (`McpClient` + injectable `Transport` + `stdioTransport`): initialize/listTools/callTool, concurrent-request correlation. `textFromContent` pure |
| `mcp/mount.ts` | v1 E5 + MCP-1 — `readMcpConfig` (accepts `servers`+`mcpServers` keys; resolves `VANTA_MCP_SERVERS` inline, else merges `./.mcp.json` project-level over `~/.vanta/mcp.json` user-level) + `mountMcpServers` (spawn each, register discovered tools as Vanta tools via `mcpToolToVantaTool` — gated by kernel `assess()`). Called in `prepareRun`; no-op without config |
| `mcp/server.ts` | MCP-3 — Vanta AS an MCP server (mirror of client.ts). `runMcpServer`/`stdioServerTransport` + pure `handleMessage` (initialize/tools/list/tools/call). Every call gated by `assess()`: `block`/`ask` → `isError` result (headless, no human), only `allow` executes. `resolveServeAllowlist` (`VANTA_MCP_SERVE_TOOLS`, default 9 read-only) bounds exposure. `vanta mcp serve` |
| `tools/mount-mcp.ts` | MCP-2 — `buildMountMcpTool(registry)` factory: the `mount_mcp` tool spawns an MCP server at runtime + registers its tools into the LIVE registry. `describeForSafety` → "spawn mcp server …" so the kernel gates the spawn. Registered by `buildRegistry` (needs the registry ref) |
| `subagent/spawn.ts` | Phase 6 — `spawnSubagent` runs an isolated worker (own goal/prompt/iter budget), returns verified outcome only |
| `a2a/{types,local}.ts` | Phase 6 — local in-process A2A message bus (`A2ABus`, `makeMessage`). Networked transport = future |
| `projects/rooms.ts` | Phase 7 — `listRooms`/`resolveRoom` over `VANTA_PROJECTS_DIR` (default `~/Documents/GitHub/_active`). `vanta room <name>` runs rooted there → per-project goal stream |
| `projects/commands.ts` | Phase 7 — `vanta rooms`/`room`/`modes` CLI handlers + learning suggestion (keeps cli.ts ≤300) |
| `modes/builtin.ts` | Phase 7 — 6 operator modes as real skills (`OPERATOR_MODES`, `installModes`). Run via `vanta skill <mode> "<instr>"` |
| `modes/learning.ts` | Phase 7 — `recordRun`/`shouldProposeSkill`; after a pattern recurs 3× proposes capturing it as a skill (`~/.vanta/usage.tsv`) |
| `routing/model-router.ts` | Phase 7 — `classifyTask` (cheap/expensive) + `resolveRoutedProvider` (`VANTA_MODEL_CHEAP`/`_EXPENSIVE`; no-op when unset) |
| `routing/vision.ts` | AUX-VISION — `visionEnv` (pure) + `resolveVisionProvider`: image tools resolve a dedicated vision model via `VANTA_VISION_MODEL` (+ optional `VANTA_VISION_PROVIDER`), else the active provider. Used by `describe_image`/`look_at_screen`/`look_at_camera` so a text-only main model doesn't break sight. The auxiliary-task pattern, scoped to vision |
| `google/auth.ts` | Phase 5 — one-time OAuth (`runGoogleAuth`, loopback) + token store `~/.vanta/google-tokens.json` (0600), `getAccessToken` (auto-refresh) |
| `google/client.ts` | Phase 5 — `googleFetch` (Bearer + 401-retry) + pure `buildUrl` |
| `tools/gmail.ts` | Phase 5 — `gmail_search`/`gmail_read` (read) + `gmail_draft`/`gmail_send` (always approval-gated) |
| `tools/calendar.ts` | Phase 5 — `calendar_read` + `calendar_create`/`calendar_update` (approval-gated) |
| `tools/drive.ts` | Phase 5 — `drive_read` + `drive_create`/`drive_update` (approval-gated). Pure `buildMultipartBody` |
| `tools/index.ts` | `buildRegistry({exclude?})` — registers 81 built-in tools in current source (including factory-built `mount_mcp`; workers exclude recursive tools such as `delegate` as needed); `roadmap_add` files new cards, `roadmap_move` changes status |
| `store/home.ts` | `resolveVantaHome`/`skillsDir`/`memoriesDir`/`slugifySkillName`/`ensureVantaStore`/`commitInHome`. The global `~/.vanta` store (`VANTA_HOME` override), git-init'd for free versioning |
| `skills/types.ts` | `Skill`, `SkillMeta`, `SkillMatch` |
| `skills/frontmatter.ts` | pure `parseSkill`/`serializeSkill` (flat YAML frontmatter) |
| `skills/store.ts` | `writeSkill`/`readSkill`/`listSkills` — `~/.vanta/skills/<slug>/SKILL.md`, auto-commits. `LEARNED_TAG` provenance constant |
| `skills/library.ts` | `installSkillLibrary({force,from})` — copies bundled `skills-library/` into `~/.vanta/skills` (idempotent, skips existing unless `--force`). `libraryDir()` resolves to `vanta-ts/skills-library/`. Called by `vanta skills install` **and auto-run in `prepareRun`** every session, so newly-bundled skills appear without a manual install |
| `skills-library/` | **35** shipped skills at `vanta-ts/skills-library/<slug>/SKILL.md`: ~10 ported from references + `agent-orchestration-workflows`, `build-mcp-server`, the **14 `nd-*` executive-function skills**, and the **9 Boris-Cherny build-catalog skills** (`standing-loops`, `keep-green`, `prod-watch`, `cluster-feedback`, `hill-climb`, `agent-fanout`, `parallel-verify-workflows`, `ship-preflight`, `agentic-build-strategy`). Add a `<slug>/SKILL.md` dir to grow the bundle; it auto-installs on next session |
| `skills/recall.ts` | pure `searchSkills(query, skills)` — weighted substring ranking |
| `skills/curator.ts` | `curate()` — **non-destructive**: archives only stale `vanta-learned` skills (reversible→`_archive`), reports stale hand-authored + long-archived (never deletes), reports overlaps. Provenance via `LEARNED_TAG` |
| `review/background-review.ts` | Track B self-improvement. `shouldReview(toolIters, turnIdx, env)` (busy/periodic trigger) + `reviewTurn()` — spawns a tool-restricted agent (`recall`+`write_skill`), replays the transcript, captures a skill tagged `vanta-learned`. Best-effort. Env: `VANTA_SELF_IMPROVE`/`VANTA_REVIEW_MIN_TOOLS`/`VANTA_REVIEW_EVERY` |
| `memory/store.ts` | `appendMemory`/`readMemory`/`recentMemory` — per-goal summaries `~/.vanta/memories/<goalId>.md` |
| `brain/brain.ts` | **THE brain — one cohesive unit; everything outside brain/ imports from here.** Composes the md regions + structured entries behind one surface: `remember`/`recall` (recall reinforces)/`brainDigest` (one composed prompt digest)/`sweep`/`brainHealth`. Per-layer best-effort: a broken layer degrades, never breaks |
| `brain/entries.ts` | Structured memory layer (absorbed brain5d store + neuro 12-axis scoring): typed entries, strength × recency × contradiction-penalized confidence, salience/retrieval bonuses, crystallization (raw→compressed→crystallized at 3/10 retrievals), `forgetAfter` decay. Tolerant reader (bad entries dropped, corrupt store quarantined — copied, never deleted), one-time `brain5d.json` migration. `~/.vanta/brain/entries.json`, git-versioned |
| `brain/regions.ts` + `brain/store.ts` | The md-region layer: 9 seeded regions (`~/.vanta/brain/<region>.md`, archived + git-versioned) + the region read/write/digest internals the facade composes |
| `brain/assoc.ts` | Association: memories auto-link to similar neighbors at write time (zero-dep token-overlap similarity, capped sparse graph) + spreading-activation recall — direct hits surface linked neighbors at damped strength (`↪`, primed not reinforced). Relevance floor keeps one-token noise out of direct hits |
| `brain/consolidate.ts` | The sleep pass: near-duplicate memories gist-merge (strength/links/retrievals carried, marked crystallized), decayed swept, hard entry budget (`VANTA_BRAIN_MAX_ENTRIES`, default 400) drops weakest-first, links healed. Auto-runs from the digest when over budget |
| `brain/learn.ts` | Auto-learning: post-turn background pass distils 0–3 durable memories from the transcript (user patterns → user_model, facts → semantic, events → episodic, **Vanta's own forming personality → identity/reflections**; ND-first guidance patterns prioritized). `VANTA_BRAIN_LEARN[_EVERY\|_MIN_TOOLS]`. Hosts surface a `🧠 learned:` line |
| `session/background-learning.ts` | The three post-turn LLM forks (skill review, session scratchpad, brain learning) — gated, best-effort, re-exported via session/after-turn |
| `sessions/store.ts` | Session persist/resume/fork: `saveSession`/`loadSession`/`forkSession`/`listSessions`/`newSessionId`. JSON files `~/.vanta/sessions/<id>.json` (id `YYYYMMDD-HHMMSS`), zod-validated. `vanta sessions`/`resume <id>`/`--resume`; `--fork-session` creates a new seeded session. `createConversation(...,{history})` seeds resumed turns |
| `search/interface.ts` | `SearchProvider` interface, `SearchResult`, `SearchConfig`, `DEFAULT_MAX_RESULTS` |
| `search/{duckduckgo,searxng,serpapi,brave}.ts` | Search adapters. Each exports a `*Provider` class + a pure mapper/parser for testing |
| `search/index.ts` | `resolveSearchProvider(env)` — reads `VANTA_SEARCH_PROVIDER`. Mirrors `providers/index.ts` |
| `prompt.ts` | `buildSystemPrompt()` — tiers: stable (SOUL+tools+rules) / brain / skills / context / `errorsLogTier` (ERRORS.md, capped 3k) / volatile (goals+time+memory) |
| `context.ts` | `trimMessages()` (fallback) + `compressMessages(msgs, ctx, summarize, {activeGoalText?})` — injects goal-reminder note after system messages when `activeGoalText` is set |
| `agent.ts` | `createConversation()` + `runAgent()` + `dispatchTool()`. `AgentDeps`: `activeGoalText?` (goal re-injection), `onIterationCheck?` (consecutive failure hook). `dispatchTool` runs EF-SELFMONITOR heuristic before `tool.execute`. `runTurn` tracks `consecutiveErrorResults` → `onText` note at threshold |
| `session.ts` | Shared run setup for one-shot + interactive: `prepareRun` (reads ERRORS.md → `errorsLog`), `buildSummarizer`, `writeRunMemory`, `consoleCallbacks`, `approver`, **`maybeCurate`**, **`reviewAfterTurn`**, `researchGateAfterTurn`, `inhibitAfterTurn`, `setShiftAfterTurn`. Neither cli.ts nor interactive.ts imports the other |
| `interactive.ts` | `renderBanner` (logo, model, goals, tool + skill inventory) + `runChat` (the REPL: one `createConversation`, history persists; slash commands via repl-commands.ts; session save + post-turn review; startup lifecycle hooks; resume fork target) |
| `repl-commands.ts` | REPL slash commands dispatcher — re-exports `SLASH_COMMANDS`, `executeSlash`, `runSlashCommand`. Handlers live in `repl/handlers.ts` |
| `repl/catalog.ts` | `SLASH_COMMANDS` array + `SLASH_HELP` — canonical command list driving `/help`, TUI palette, and validation |
| `repl/handlers.ts` | `HANDLERS` registry + `dispatch(cmd, arg, ctx)` — every slash handler, each a `SlashHandler` const |
| `repl/init-cmd.ts` | `CC-INIT-CMD` — `/init [--force|--print]` writes `.claude/CLAUDE.md` with detected stack, visible structure, existing context docs, and working rules; refuses overwrite by default |
| `repl/next.ts` | ND1 — `next` handler: reads active kernel goals → `resend` prompt asking agent for one concrete next micro-step |
| `repl/plan-mode.ts` | ND3 — `planMode` handler: toggles plan-first mode via `PLAN_MARKER` injection into live system prompt (`/planmode [on|off]`) |
| `repl/where.ts` | EF-WORKINGMEM — `/where` handler: `lastIntent` (last user message) + `lastToolCalls` (last 5 tool names) as a breadcrumb |
| `repl/inhibit.ts` | EF-INHIBIT — `InhibitState` + `nextInhibitState`/`shouldAlertInhibit`/`buildInhibitText`. Post-turn drift counter (3 consecutive non-output turns → alert). `VANTA_INHIBIT_THRESHOLD` override |
| `repl/set-shift.ts` | EF-SETSHIFT — `SetShiftState` + `getPrimaryTool`/`nextSetShiftState`/`shouldAlertSetShift`. Post-turn stuck-loop detector (same primary tool 3 turns → alert). `VANTA_SETSHIFT_THRESHOLD` override |
| `repl/self-monitor.ts` | EF-SELFMONITOR — `isDestructiveAction`/`isAdditiveGoal`/`shouldWarn`/`buildSelfMonitorText`. Synchronous pre-execution heuristic in `dispatchTool`; fires via `deps.onText` (zero LLM, never blocks) |
| `repl/error-detect.ts` | EF-ERRORDETECT — `isErrorResult`/`buildErrorDetectText`. Consecutive `ok:false` or error-keyword results tracked in `runTurn`; at 3 fires `onText` note + `deps.onIterationCheck?` callback |
| `repl/closure-gate.ts` | EF-CLOSUREGATE — `extractWrittenFiles`/`hasCommitAfterIndex`/`getInProgressItems`/`buildClosureGateText`. On topic shift (same `isTopicShift` check), surfaces unclosed write_file calls without a subsequent commit |
| `repl/model-cmd.ts` | `/model` handler (extracted from handlers.ts). Bare → prints active model (TUI opens the picker); `/model <arg>` → `parseModelArg` (`model-switch.ts`) → hot-swap convo + setup.provider + persist to .env. Returns `SlashResult.provider` so the TUI banner refreshes |
| `repl/moim-cmd.ts` | `/moim` handler (extracted) — pin/show/clear a top-of-mind note (writes via `moim/store`, patches the live system prompt) |
| `repl/restart-cmd.ts` | RESTART — `/restart` exits with `RESTART_EXIT_CODE` (75); `run.sh`'s relaunch loop re-execs tsx. Refuses unless `VANTA_RELAUNCH` is set (run.sh sets it). Hosts: interactive.ts + ui/app.tsx + ui/launch.tsx force the 75 exit |
| `repl/bug-cmd.ts` | BUG-CAPTURE — `/bug <what happened>` → pure `formatBugRecord` (desc + model + last intent + `recentToolNames` + git state) written to `.vanta/bugs/*.md` |
| `repl/handoff-cmd.ts` | HANDOFF-PACKET — `/handoff` → pure `formatHandoffPacket` + shared `assembleHandoff` (goals + git + recent tools + last intent/result + NEXT slot). `assembleHandoff` is reused by AUTO-HANDOFF |
| `repl/auto-handoff.ts` | AUTO-HANDOFF — `shouldAutoHandoff`/`maybeAutoHandoff` write `.vanta/handoff.md` when context fill ≥ `VANTA_AUTOHANDOFF_THRESHOLD` (0.75); `prepareRun` reloads + consumes it on interactive launches. Both hosts call `maybeAutoHandoff` post-turn |
| `repl/next.ts` | ND1 `/next` + GOAL-ACTION: `isVagueGoal` + shared `buildNextStepResend` (active goals + choice-reduced backlog → single-micro-step prompt); the `/goal` handler auto-fires it on a vague goal |
| `repl/stall.ts` | STALL-UNBLOCK — post-turn gate (`nextStallState`/`shouldAlertStall`/`buildStallText`). With an active goal + no write/commit for `VANTA_STALL_THRESHOLD` (4) turns, names the top backlog card as the unblocker. Wired via `stallAfterTurn` |
| `repl/mode-detect.ts` | MODE-DETECT — pure `detectMode` (silent-executor/collaborator/critic/researcher/debugger/assistant) + `buildModeHint`; both hosts prepend the hint to the SENT message. `VANTA_MODE_DETECT=0` disables |
| `tool-retry.ts` | TOOL-RETRY — `shouldRetryTool` (idempotent-read allowlist ∧ transient-failure regex) + `resolveToolRetries` (`VANTA_TOOL_RETRIES`, default 1). `agent.ts dispatchTool` retries safe reads on a transient failure |
| `pricing.ts` | COST-VISIBLE — `estimateCostUsd` (approx $/1M table) + `isLocalProvider` + `formatTurnCost` + `addTurnCost`/`formatSessionCost` (local-free vs frontier split on `ReplState.sessionCost`). Both hosts print the per-turn footer; `/usage` shows the split |
| `roadmap/add.ts` | ROADMAP-ADD — `addRoadmapItem` (validate, refuse dup id, append, bump `updated`, rebuild HTML) — companion to `roadmap/move.ts` |
| `tools/roadmap-add.ts` | `roadmap_add` tool (required id+title; defaults status=next/track=Backlog/size=M) → `addRoadmapItem` |
| `repl/goal-cmd.ts` | `/goal` handler (extracted) — show/set/clear/done; `setNewGoal` persists + patches the live prompt + fires GOAL-ACTION on a vague goal |
| `repl/open-cmd.ts` | CC-EDITOR — `/open <file[:line]>` → `openInEditor` |
| `editor/open.ts` | CC-EDITOR — pure `parseFileLine` + `resolveEditor` (VANTA_EDITOR>VISUAL>EDITOR, default code) + `editorCommand` (code -g / +line / file:line) + `openInEditor` (detached spawn). `vanta open` CLI |
| `lint/size.ts` | CODE-SIZE-GATE — pure `analyzeSource` (TS compiler API): file≤300, fn≤50, params≤4, cyclomatic≤10 → `Violation[]` (file:line+limit+fix). `LIMITS`, `formatViolation` |
| `lint/run.ts` | `vanta lint [files\|--staged]` — `resolveTargets` (explicit=cwd-relative, git=root-relative), `lintFiles` (reports analyzed vs missing), `runLint` (exit 1 on violations/missing) |
| `cli.ts` | Thin entry point: bootstrap (`findRepoRoot`/`loadEnv`/`ensureVantaStore`) + `startInteractive` (TTY-gated first-run wizard) + a `COMMANDS` lookup table (a returned number = exit code). `chat`/`--resume`/`resume`/`run` stay explicit for global flags (`--init*`, `--fork-session`). Add a command = one table entry. |
| `cli/commands.ts` | The `vanta <cmd>` handlers extracted from cli.ts (CODE-SIZE-GATE): `usage`/`usageExit`, `runInstruction` (shared run/skill/room path), `runSessionsList`/`runSkillsCommand`/`runMemoryCommand`/`runVoiceCommand`/`runHooksCommand`/`runSkillCommand`/`runRoomCommand` |
| `cli/lifecycle.ts` | `parseLifecycleFlags` + `runLifecycleHooks`: `--init` runs Setup hooks, `--init-only` runs Setup + SessionStart and exits, `--maintenance` sets maintenance context and exits |
| `cli/output-callbacks.ts` | Output callback builder for `vanta run` (`text`/`json`/`stream-json`) split out to keep `commands.ts` under size limits |
| `compress/types.ts` | COMPRESS-NATIVE — `ContentType` (`json`/`log`/`binary`/`text`), `CompressOptions`, `CompressResult`, `DEFAULTS`, `estTokens` |
| `compress/router.ts` | `detectContentType(text)` — pure classifier (binary/log/json/text). `compressContent(text,opts)` — routes to the right compressor, returns no-op if ratio ≥ threshold |
| `compress/json-crush.ts` | `crushJson(text,opts)` — strips whitespace, number precision, long arrays → `[n items]` stub |
| `compress/log-squash.ts` | `squashLogs(text,opts)` — deduplicates repeated log lines, collapses runs |
| `compress/store.ts` | CCR (Context-Compression Retrieval) stash: `ccrId(text)` (hash) + `storeCcr`/`retrieveCcr` — `.vanta/ccr/` files so the agent can ask for the full text after compression |
| `compress/apply.ts` | `compressEnabled(env)` + `COMPRESS_TOOLS` allowlist + `shouldCompressTool(name)` + `applyCompression(toolName,output,opts)` — wired into `agent.ts dispatchTool`; only compresses tools on the allowlist |
| `cli/ops.ts` | Larger op handlers: `dataDirFor`/`buildCronRunTask`/`runGatewayCommand`/`runServiceCommand`/`runMcpCommand`/`runRoadmapCommand`/`runFactoryCommand`/`runDesktopCommand` |
| `cli-dx/` | CLI-DX-PACK: `prompt-size.ts` (token breakdown), `completion.ts` (shell completion + CLI_COMMANDS), `backup.ts` (tar ~/.vanta) |

## The loop (`agent.ts`)

```
messages = [system, user]
each iteration (max VANTA_MAX_ITER=50):
  trim → provider.complete(messages, schemas)
  no tool calls + non-empty text → DONE
  no tool calls + empty → nudge once
  for each tool call → dispatchTool:
    describeForSafety(args) → safety.assess()
      block → tool_result "blocked", no exec
      ask   → requestApproval(y/n); propose+approve|deny in kernel
      allow → execute
    append tool_result; logEvent
  3 consecutive empty results → stop
```

**Safety is two-layer:** `assess()` gates on the kernel (keyword/scope). Tools also self-check (path scope, overwrite approval via `ctx.requestApproval`). `describeForSafety` sends only the risk-relevant part to assess (path/command, **not** file content — else content keywords false-trigger).

## How to add a tool

1. New file `tools/<name>.ts` exporting a `Tool`: `schema` (name, description, JSON-schema `parameters`), `describeForSafety` (return the safety-relevant string), `execute(args, ctx)`.
2. Parse `args` with **zod** (`safeParse`) — it's an LLM boundary.
3. Path args → `resolveInScope`; return `{ok:false}` if outside.
4. Return `ToolResult` (errors-as-values, never throw across the boundary).
5. Register in `tools/index.ts`. Add a test in `tools/tools.test.ts`.

## How to add a provider

Implement `LLMProvider` (`complete`/`modelId`/`contextWindow`), add a branch in `providers/index.ts`. Keep the agent loop provider-agnostic — it only sees the interface.

## How to add a search provider (Phase 2B)

Implement `SearchProvider` (`id` + `search(query, config)`) in `search/<name>.ts`; add a branch in `search/index.ts`. Providers MAY throw on network/auth failure — `web-search` catches and returns errors-as-values. Keep parse/shape logic in a pure exported fn (`parseDdgHtml`, `mapSearxngJson`, …) and unit-test it with an inline fixture (no network). HTML scraping (DDG) uses `linkedom`; the JSON-API providers use native `fetch` only.

## Key decisions (don't re-litigate without new info)

- **Non-streaming in v0** — the loop waits for the full tool call before executing anyway; streaming only adds live text display. Fits behind the interface later.
- **No Anthropic stub** — `resolveProvider` throws a clear "Phase 4" error instead of a fake adapter. Per global rule: no stubs returning fake values.
- **Kernel is the boundary** — TS never decides safety; it asks the kernel. `assess` before every tool.
- **Tool results are values, not exceptions** — `{ok, output}`. The loop never crashes on a tool error.
- **Search mirrors providers** — `SearchProvider` is the same swap-by-env pattern as `LLMProvider`. DDG is the keyless default; Searxng (self-host) is the privacy recommendation; SerpAPI/Brave are opt-in with keys.
- **`web-search` resolves its provider lazily** from `process.env` at call time, so `buildRegistry()`/`ToolContext`/the loop stayed unchanged when search was added.

## Conventions

ESM `.js` imports · zod at every LLM/HTTP boundary · errors-as-values in tools · files <300 lines, fns <50 · `tsc --noEmit` must be clean before done · co-located `*.test.ts` (vitest). Integration tests in `agent.test.ts` use a `FakeProvider` + live kernel; they self-skip if the kernel is down.

## Env

`VANTA_PROVIDER` (openai|ollama|anthropic) · `VANTA_MODEL` · `OPENAI_API_KEY` · `VANTA_OLLAMA_URL` · `VANTA_KERNEL_URL` · `VANTA_MAX_ITER`. Defaults in `.env.example`. Local `.env` (gitignored) defaults to Ollama qwen2.5:14b.

Search (Phase 2B): `VANTA_SEARCH_PROVIDER` (ddg|searxng|serpapi|brave, default ddg) · `VANTA_SEARCH_URL` (searxng) · `SERPAPI_KEY` · `BRAVE_KEY`.

Store (Phase 2A): `VANTA_HOME` overrides the global store dir (default `~/.vanta`). Holds `skills/` + `memories/`, git-init'd; writes auto-commit (best-effort). Tests point `VANTA_HOME` at a temp dir.

Phase 3/4: `ANTHROPIC_API_KEY` (anthropic provider) · `VANTA_VISION_MODEL` (describe_image, default gpt-4o-mini) · `VANTA_ALLOWED_DOMAINS` (comma list; browser tools prompt-approve unlisted domains). Browser tools need `npx playwright install chromium` for live use (degrade gracefully without it). LSP tools cover .ts/.tsx only.

Phase 7: `VANTA_PROJECTS_DIR` (project rooms, default `~/Documents/GitHub/_active`) · `VANTA_MODEL_CHEAP` / `VANTA_MODEL_EXPENSIVE` (task-routed models; unset = no routing).

Phase 5 (comms): `VANTA_GOOGLE_CLIENT_ID` + `VANTA_GOOGLE_CLIENT_SECRET` (one-time OAuth client — provision once in Google Cloud Console, then `vanta auth google` is one click per user). Tokens stored per-user in `~/.vanta/google-tokens.json`. Every outbound (send/draft/create/update) is always approval-gated. Comms tools are offline-unit-tested only; live use needs the OAuth client + consent.

## Gotchas

- **gitleaks pre-commit hook** runs `gitleaks protect --staged` on every commit. Hook lives at `scripts/pre-commit`; `install.sh` symlinks it into `.git/hooks/`. Example files (`.env.example`, `.mcp.json.example`) and test fixtures are allowlisted in `.gitleaks.toml`. If you get a false positive, add a pattern to the `allowlists` section — don't skip the hook.

- **DDG html endpoint 403s from datacenter / flagged IPs.** The `duckduckgo` adapter and its parser are correct (unit-tested), but `html.duckduckgo.com` / `lite.duckduckgo.com` block scrapers by IP — verified 403 from this dev environment on every endpoint/header/verb combo. Not a code bug. For reliable search off a residential IP, use Searxng (self-host) or Brave/SerpAPI. `web-fetch` is unaffected (verified live: example.com + Wikipedia → clean Readability markdown).

- **Current source counts beat historical session counts.** As of the 2026-06-14 context sync, `buildRegistry()` reports 81 built-in tools and `SLASH_COMMANDS.length` reports 93 commands. Older counts in session history are milestones, not current truth.

## Session additions (2026-06-14) — keep current

**Auto minimalism (rewritten from ponytail MIT, renamed `auto`).** A "do the least that works" discipline, taken non-redundant with Vanta's stack (the size gate already enforces the floor mechanically; CLAUDE.md already enforces anti-drift). **Vanta:** `skills-library/auto/SKILL.md` (the generative YAGNI→stdlib→native→dep→one-line ladder + the `auto:` ceiling-comment convention; auto-installs to `~/.vanta/skills` **and** `~/.claude/skills`) + `/auto [lite|full|ultra|off|review]` (`repl/auto-cmd.ts`: live system-prompt directive injection mirroring `/planmode`'s marker; `review` resends a deletion-accounting rubric — distinct from `/simplify`'s general cleanup). Pure helpers (`parseAutoArg`/`buildDirective`/`stripDirective`) unit-tested. **Global Claude Code:** `~/.claude/commands/auto.md` (a `/auto` slash command — works in every project) + `~/.claude/skills/auto/SKILL.md`. Skipped the upstream's JS hooks, 6 framework rule-copies, benchmarks, pi-extension.

**TUI parity grind + research intake.** Built the Claude-Code-shaped surfaces on the 06-13 rebuild and reversed two of its "not built" notes.

- **Approval → Claude-style numbered menu** (`ui/approval-prompt.tsx`): `Do you want to proceed? ❯1 Yes / 2 Yes,don't ask again / 3 No (esc)`, ↑↓/Enter/1-3/Esc. Option 2 persists a tool-scoped allow rule (`ui/grant.ts` → permissions); kernel **block** stays immovable.
- **Shift+Tab mode cycle** (`normal → auto-accept → plan → normal`, `▶▶/⏸` indicator). Auto-accept auto-approves the kernel **ask** tier only (block refused upstream → safe by construction) — this **reverses the "auto-approve/yolo skipped" note**. Plan reuses real `/planmode` enforcement.
- **Transcript:** tool calls render `⏺ Verb(detail)` / `⎿ result` (dropped the grouped header) + clean labels for grep/glob/background/refs; **syntax-highlighted** fenced code (`ui/highlight.ts`); **no** Goal/Expected preamble (prompt rule reframed) and **no** per-turn token dump.
- **Chrome:** rounded composer box + **blinking cursor** (`ui/use-blink.ts`); truecolor **hex theme** (matches `docs/design-refs`); active-goal `◇` line + compact PLAN `▰▰▱▱ ✓◐○` bar + status chips (live `◷` timer via `ui/use-clock`, `MCP ✓`); rich pickers (`●` current).
- **New overlays/commands:** `/loops` (loop dashboard over the real store), `/changes` (interactive edit-review with git keep/undo), `/context` (visual per-category token breakdown), styled `/goals` ledger.
- **Anti-ghosting (2nd vector):** streamed text commits to `<Static>` the moment a tool call follows it (`ui/reducer.ts commitText`) — see ERRORS.md.
- **Carried-goal-paused-on-launch:** a prior-session goal starts PAUSED (no silent re-run on restart); `/goal resume` activates, `/goal clear|drop` drops; `VANTA_GOAL_RESUME=auto` restores old behavior.
- **Research intake → roadmap (now ~741 cards):** three reference docs in `docs/research/` + ~37 cards from *Dive into Claude Code* (arXiv:2604.14228, `PAPER-*`), *Anatomy of an Agent Harness* (`HARNESS-*`), and *Self-Correcting Agent Harness* (`SELFHARNESS-*`).
- **Built-not-wired:** `term/json-format.ts` (Vanta summarizes tool output, so no raw-output display surface yet — `CC-SHELL-JSON-FORMAT` stays next).

**8 large rocks — slice 1 of each shipped (operator capabilities).** Each rock got one vertical slice: a `~/.vanta/*.jsonl` store + a kernel-gated tool + a `/`-command view, following the `world` reference pattern. All 8 now have a shipped slice; later slices tracked per-card in `roadmap.json`.

- **World model** (`world/store.ts` + `tools/world.ts` + `/world`) — entities + relations across your systems. **Money OS** (`money/*` + `/money`) — offers/prospects/revenue. **Opportunity radar** (`radar/*` + `/radar`) — scored opportunities. **Background teams** (`team/*` + `/team`) — named worker roster. **Life-wide search** (`search/life.ts` + `tools/life-search.ts` + `/lifesearch`) — source-cited search across the local stores. **Self-repair compartments** (`self/compartments.ts` + `/compartments`) — body map + max-autonomy per part. **Verification organ** (`/skeptic` in `repl/think-cmd.ts`) — adversarially refute a claim by default.
- **Browser body** (8th, `browser/act.ts` + `tools/browser-act.ts` → `browser_act` tool) — the action-OUT surface (navigate/click/type/press/scroll/wait) over the existing playwright `acquirePage`. `classifyAction` flags irreversible controls (submit/buy/delete/login/send), secret entry, and Enter; the tool gates any such sequence — plus unlisted domains — through `ctx.requestApproval` with a **masked numbered dry-run preview** before launching. Pure `riskyActions`/`previewActions`/`describeAction` (secrets never printed). This is the browser surface of the `DESKTOP-*` rocks; OS-level coord/a11y targeting + kill-switch remain later slices. **71 tools.**
- Operator `/`-views barrel through `repl/operator-cmds.ts`; deep-thinking `/skeptic` joins `/ultrathink`/`/ultracode`/`/deep-research` in `think-cmd.ts`.

**Rocks — slice 2 across all 8 (depth pass).** Each rock got a second vertical slice (pattern: a NEW pure module imported by the existing tool/command, so slice-2 work stays on disjoint files; built by a parallel-subagent wave + central verify). All green: typecheck clean, **311 tests** across the touched files, size gate clean (28 files).

- **Verification organ (keystone)** — `regression_lock` tool (NEW, `tools/regression-lock.ts` + `verify/store.ts` verify.jsonl + pure `verify/check.ts` grading) + `/locks` view (`repl/verify-cmd.ts`). `lock {claim, command, expect}` records a regression case; `check [id]` re-runs the locked command(s) (each approval-gated), flags a regression if the substring is gone or the command exits non-zero; `list` shows status. A debugged failure becomes a locked, re-runnable proof — `SELFHARNESS-FAILURE-TO-TEST`. **72 tools.**
- **World** — `world/conflicts.ts`: `findConflicts` (contradiction = same subject+predicate, different object) + `recallWithSources` (cited recall); `world` tool `conflicts` action, `query` now cited, `/world` ⚠-flags conflicts.
- **Money** — `money/review.ts`: `suggestPrice` (median band) + `weeklyReview`; `money` tool `price`+`weekly`, `/money` weekly snapshot.
- **Radar** — `radar/scan.ts`: `rankOpportunities` (composite pain×signal, recency tie-break) + `draftOffer`; `radar` tool `scan`+`offer`, `/radar` ranked.
- **Teams** — `team/tasks.ts`: a task-assignment + legal-transition status ledger (team-tasks.jsonl); `team` tool `dispatch`/`advance`/`tasks`, `/team` shows per-worker load + running task. (Live agent-spawn = later slice.)
- **Life-search** — `search/life-rank.ts`: dependency-free relevance ranker (term density + exact-phrase + title-hit + recency, 0..1); results ranked, `/lifesearch` relevance bar. (Vector embeddings = later slice, no embed-dep added.)
- **Self-repair** — `self/detect.ts`: `detectBroken` (per-compartment healthy/impaired/down from real cap checks) + `lastKnownGood` (newest good git sha per compartment = rollback target) + repair.jsonl markers; `/compartments` shows health + lkg sha.
- **Browser** — `browser/observe.ts`: `summarizeElements`/`formatElements` (interactable targets + suggested selectors); `browser_act` gains `observe:true` (appends a grounding block) + a **kill-switch** `VANTA_BROWSER_DISABLED` (short-circuits before any launch/approval).

**Rocks — slices 3–4 (depth to done) + completion ledger.** Drove each rock toward its done-criterion. Full map: `docs/research/rocks-completion-ledger.md`.

- **S3:** radar→money `promote` (scored opportunity → prospect, cross-rock inflow); world `merge`/`duplicates` (`world/merge.ts` consolidate + re-point relations); self-repair propose-only `rollback` (`self/rollback.ts` — prints `git checkout <lkg-sha>`, **never auto-executed**, Rule Zero).
- **S4:** world freshness/confidence (`world/confidence.ts` — recall now `[likely · 62% · source:ts]`); money `deliverable`+`followup` record kinds (`money/work.ts`); life-search change-detecting `refresh` (`search/refresh.ts` djb2 per-store digests).
- **Done:** World model, Money OS, Verification organ, + DESKTOP-ACTION-SCHEMA & DESKTOP-CONTROL-BOUNDARY (browser surface). **Horizon (deliberate, documented boundary):** radar live scanning (needs reliable search), life-search embeddings (needs embed model), self-repair auto-rollback + teams live-spawn (need operator sign-off — self-`git reset`/agent-spawn are Rule-Zero-gated), browser OS-level control (needs a desktop driver).
**Rocks — horizon builds (operator-authorized 2026-06-14).** The 4 named horizon blockers, each with safety rails:
- **Radar live scanning** — `radar/extract.ts` + `scan_web` action: `resolveSearchProvider` runs live search, `extractOpportunities` scores pain/buyer signals, appends candidates; catches search failure → clean value (never throws). **Opportunity radar → done.**
- **Life-search local embeddings** — `search/embed.ts` + `semantic` action: ollama `/api/embeddings` + `cosineSim`, **zero new dep**, `VANTA_EMBED_MODEL` (default `nomic-embed-text`), graceful lexical fallback. **Life-wide search → done.**
- **Self-repair auto-rollback** — `self_repair` tool (`tools/self-repair.ts`): `mark` (record HEAD as a compartment's lkg) + `rollback` (kernel-assessed + approval-gated `git checkout <lkg> -- <paths>`, **refuses protected brainstem/skeleton + unscoped limbs**, warns on discarded changes) + `status`. **73 tools.**
- **Teams live-spawn** — `team` `run` action: actually spawns a worker for a dispatched task via `spawnSubagent` (child registry excludes `delegate`+`team` → no recursive fan-out; every worker tool call kernel-gated, same model as `delegate`), advancing the task running→done/blocked. **Background teams → done.**
- **7/8 rocks complete.** Remaining: self-repair sandbox-test-before-attach (a build atop `run-code` isolation) + browser OS-level control (needs a desktop driver). Full map: `docs/research/rocks-completion-ledger.md`.

**Reach layer (Agent-Reach pattern, MIT — `docs/reach.md` + `docs/research/agent-reach-eval.md`).** Vanta's internet-reach capability layer: a channel = ordered, real-probed backends + a doctor. `src/reach/`: `channel.ts` (ReachChannel contract + `orderedBackends` env override), `probe.ts` (really-executes, not which()), `registry.ts` (`resolveChannel`/`checkAll`), `doctor.ts` (`/reach` report), `cookie.ts` (shared 0600 cookie store for login-walled channels + `parseCookieInput` for Cookie-Editor JSON/header), `channels/{web,search,rss,reddit}.ts`. Tools: `rss_read` (dependency-free RSS/Atom via `reach/rss-parse.ts`), `cookie_import` (kernel-gated credential store, never echoes), `reddit_read` (search/read via Reddit `.json` + cookie, `reach/reddit-parse.ts`). Commands: `/reach` (doctor), `/cookie` (export guide). Source now reports **81 built-in tools**. Deferred channels (Twitter, LinkedIn, podcast, V2EX, Bilibili, Xiaohongshu, Xueqiu) = `REACH-*` cards.

**CC-INIT-CMD + lifecycle/session flags.** `/init [--force|--print]` generates `.claude/CLAUDE.md` for the current project. `--init` runs Setup hooks before a session; `--init-only` runs Setup + SessionStart and exits 0; `--maintenance` adds maintenance context for Setup hooks. `--fork-session` with resume creates a new seeded session while leaving the original intact. `roadmap.json` marks `CC-INIT-CMD`, `CC-INIT-FLAGS`, and `CC-FORK-SESSION` shipped. **93 slash commands.**

- **Test isolation fix:** `agent.test.ts` now isolates `VANTA_HOME` to a temp dir — dispatch reads `loadRules(process.env)` from `~/.vanta/permissions.tsv`, so a real `allow shell_cmd` rule (the "always allow" feature, working as designed) was auto-approving the action the ask-risk integration test expects to prompt on. Pre-existing flake; full suite now deterministic. **Full suite: 345 files / 2998 tests green; typecheck clean; size gate clean.**

## Session additions (2026-06-13) — keep current

**TUI full rebuild (Claude method) + command/persistence work.** The vendored `hermes-ink` fork never had a `<Static>` layer (root cause of the ghosting — see [[vanta-tui-rootcause]] in memory); rebuilt the whole interactive surface on **real Ink 7** the Claude way: inline render + React `<Static>` committed scrollback, so the terminal owns history (native selection/scroll/copy, zero ghosting) — no AlternateScreen, ScrollBox, mouse-capture, or virtual-history.

- **New render layer:** `src/ui/` (app, reducer, transcript, composer, banner/wordmark, overlays, status-bar, markdown, theme context, stream-view, todo-panel, busy, slash/at/use-* hooks). **Shared pure helpers** moved to a neutral `src/term/` (theme, figures, composer-edits, tool-display, tool-result, at-context, capabilities, notify, model-switch, tokens). **Deleted:** `vendor/hermes-ink` (the fork), the old `src/tui/` render layer, `src/types/ink.d.ts`; the `inkr` alias is gone (`ink` = real Ink 7). ONE survivor under the old path: `src/tui/mission-control/cockpit-data.ts` (data, not render). **Default surface** — the `VANTA_UI2` gate is removed (resume/--no-tui/no-TTY still use the readline REPL).
- **Look (matches Claude Code v2 / Cursor, source-verified via the terminal-love MCP):** borderless VANTA block-wordmark title screen, markdown + GFM tables, grouped tool-call headers (`⏺ verbs · N actions · ~Nk tok`) over dim per-tool rows with inline diffs, context gauge (`48k/200k [██░░] 24%`), bordered approval prompt, rotating busy verb + elapsed, responsive (segment-dropping) status bar + prefix-hint line, light/dark theme auto-detect (COLORFGBG), live todo panel. Composer parity: readline chords, history, multiline, queue-while-busy, undo/redo, `^G` $EDITOR, image-paste, `Esc`-interrupt.
- **Architecture-bounded (NOT built, by design):** per-section expand/collapse, full-thinking expand, turn-backtrack *visual* retract, live spawn-tree — all need retroactive repaint of committed rows, which `<Static>` forbids (the whole point). Auto-approve / "yolo" modes skipped (bypass the kernel = rule zero).
- **Commands → 75:** added `/setup` (opens the provider/model picker) + 8 one-shot CLI verbs surfaced via a subprocess bridge (`repl/cli-bridge.ts`): `/config /settings /models /lint /roadmap /audit /today /import` (daemons/interactive verbs stay CLI-only).
- **Persistence:** resume (auto-handoff + session-memory) is **age-gated** — only carried into a restart if recent (`VANTA_RESUME_MAX_AGE_MIN`, default 120; 0 = always clean), fixing "stuck on an old thread after restart"; the TUI todo panel is session-scoped (reflects only the agent's `todo`-tool writes this session, never a stale global plan). Standing goals still persist (/goal clear).
- **terminal-love MCP** wired into Vanta via repo `.mcp.json` (12 Terminal Trove design-reference tools mount as kernel-gated `mcp_terminal-love_*` tools); also shipped its own v1 (stars enrichment, richer screenshots, search TTL, MCP resources).

## Session additions (2026-06-12) — keep current

**TUI build plan — Phases 1–4 (the demo aesthetic + the Opus-tier surfaces).** Target = `docs/design-refs/tui-demo.html`; plan + status = `docs/design-refs/tui-buildplan.html`.

- **Design-token + glyph layer (P1):** `term/figures.ts` (named glyphs ⏺ ❯ ✻ ✔ ✘ ▶ + ASTERISK_FRAMES + verbs). `ui/theme.tsx` semantic tokens (success/error/warning/info/marker/userMarker; `primary` = text/white, identity in accent/border/marker). Glyphs wired through `ui/transcript.tsx` (⏺ assistant marker, ❯ user, ✻ boundary), `ui/status-bar.tsx` (● ready), spinners (`asterisk` cycle).
- **Interactive footer (P2):** `ui/status-bar.tsx` — one dim line above the composer: ○/◐/● permission mode · model · "? for shortcuts".
- **Keybinding registry (P3):** `ui/shortcuts.ts` + `ui/composer-keys.ts` — chord parse/match/format (`ctrl+o`→`^O`, `shift+tab`→`⇧⇥`), `DEFAULT_BINDINGS` grouped by `KeyContext` (global/transcript/composer/palette/at-palette/modal/tabs), `useKeybinding(action, handler, {isActive})` + cached merged chord map, optional `~/.vanta/keybindings.json` overrides (zod-validated, fail-soft). `ui/help-panel.tsx` renders from the registry. (Composer emacs/readline + history edge-fall-through already existed.) **Not** done vs the stricter CC-KEYBINDING-* roadmap cards: no hot-reload watcher, no `/doctor` report, no conflict warnings.
- **Layout & mission-control (P4, opt-in):** `ui/app.tsx` `<Static>` + live bottom rows. `ui/cockpit-panel.tsx` — tabbed Kernel verdict ladder / live Goals / live Loops (`gatherCockpitData` in `tui/mission-control/cockpit-data.ts`: getGoals + listDefs/loadState/openEscalations, best-effort), opened via `/cockpit`, switched by the `tabs` keybinding context. `ui/transcript.tsx` `toolGroupRole` brackets consecutive tool calls into one ┌│└ block. ⇧⇥ approval-cycle suppressed while an overlay is open so tabs owns ⇧⇥. **Note:** this is a lighter opt-in overlay, NOT the TUI-V2 card's always-on 3-column rail surface (that card stays open).
- **Env:** documented `VANTA_THEME` / `VANTA_SPINNER` / `VANTA_VIM` + `~/.vanta/keybindings.json` in `.env.example`.

## Session additions (2026-06-11) — keep current

**v0.2.0.** Four Harness rocks + a full size-gate cleanup. All editable TS now passes file ≤300 / fn ≤50 / params ≤4 / cx ≤10 (only kernel-protected `factory/*` excepted).

- **Session memory** (`memory/session-memory.ts`) — a forked distiller maintains `.vanta/session-memory.md` during the session (periodic / busy turns); re-injected interior on compaction (`context.ts`) and into the system prompt on resume (`prepareRun`). `Conversation.setSessionMemory` refreshes the live injection. Env: `VANTA_SESSION_MEMORY[_EVERY|_MIN_TOOLS]`. Post-turn wiring lives in `session/after-turn.ts`.
- **Streaming tool execution** (`agent/stream-dispatch.ts`) — providers emit a `tool_call` stream chunk when a block completes; the loop prefetches concurrency-safe reads (`CONCURRENCY_SAFE_TOOLS`) mid-stream and reuses the in-flight result. openai emits via the pure `completedToolCalls` fold. `done` stays the source of truth (backward-compatible).
- **MessageDisplay hook** (`agent/message-display.ts`) — `plugins/hooks.ts` gains a `message_display` event (rewrite/suppress) fired before render; raw text stays in the transcript. Strip-`<thinking>` builtin, opt-in `VANTA_STRIP_THINKING`. The TUI commit now prefers the (transformed) finalText.
- **Shell-hooks engine** (`hooks/shell-hooks.ts`) — `.vanta/hooks.json` fires external shell commands on Setup / SessionStart / PreToolUse (non-zero exit BLOCKS, fail-closed, after the kernel gate) / PostToolUse / UserPromptSubmit / Stop. JSON context on stdin; regex matcher for tool events; `maintenance` and `sessionType` filters are supported. Wired in `agent/dispatch-tool.ts` + `interactive.ts`. Distinct from the in-process `plugins/hooks.ts` JS bus.

**Decomposition (size grind):** new modules from splitting oversized files — `session/after-turn.ts`, `agent/{agent-types,plan-gate,dispatch-tool}.ts`, `interactive-turn.ts`, `cli/{extra-cmds,roadmap-cmd}.ts`, plus `context.ts splitForCompaction`. Behavior-preserving extraction + re-export; full suite green throughout. Parallel-subagent waves + central full-suite verification did the bulk.

**Cohesive brain (BRAIN-COHESIVE):** the brain is one unit — `brain/brain.ts` facade composing the md regions with a structured entries layer (`brain/entries.ts`, rebuilt from the dormant brain5d + neuro modules, now deleted). `brainDigest` (session.ts) injects regions + top scored memories in one digest; the `brain` tool gains `remember`/`recall` actions (recall reinforces → crystallization). Always-on; per-layer best-effort; corrupt store quarantined; legacy `brain5d.json` migrated. `brain/v2.ts` (self-evolving substrate) parked — see PARKED.md + DECISIONS 2026-06-11.

**Turn-abort hardening (post-incident, see ERRORS.md 2026-06-11):** `sanitizeMessages` now also synthesizes stub results for DANGLING assistant tool calls (a turn aborted mid-dispatch used to brick the session — every later call 400s on the missing tool output; saved sessions resumed the brick). `applySafetyGate` fails CLOSED but gracefully when the kernel is unreachable (blocked tool result + "restart vanta", instead of throwing through the loop); approval-queue bookkeeping is best-effort. TUI scroll: pgup/pgdn (fn+↑/↓ on Mac) **and** ⇧↑/⇧↓ fine-scroll through inline `<Static>` scrollback. `VANTA_MOUSE=1` enables mouse-wheel tracking (off by default — mouse tracking blocks native text selection; ⇧↑/↓ + pgup/pgdn scroll without it). Composer already supports ⌥⌫ (kill word) and ^U (kill to start); a literal cmd+⌫ never reaches terminal apps unless the terminal maps it (e.g. iTerm: cmd+⌫ → send hex 0x15).

**Comment convention:** code comments + commit messages stay Vanta-native — no Claude Code / `CC-` / Hermes provenance (the real `claude-code` provider integration + roadmap card-ids are kept).

## Session additions (2026-06-02/03) — keep current

**Providers:** `VANTA_PROVIDER` now also: `gemini` · `openrouter` · `codex` (alias `openai-codex`, ChatGPT-subscription OAuth via `~/.codex/auth.json`, Responses API — `providers/codex.ts`+`codex-auth.ts`) · `claude-code` (Claude sub OAuth). Catalog: `providers/catalog.ts`.

**Multimodal:** user `Message` carries optional `images:[{mime,dataBase64}]` (`types.ts`), mapped natively by every provider. Attach via `/image <path>`, `/paste` (clipboard, macOS), drag-drop (`maybeDroppedImage`), or `/attachments [clear]`. Vision tools `describe_image` + `look_at_screen`/`look_at_camera` (Vanta's eyes) route through `resolveVisionProvider` (`routing/vision.ts`): a dedicated vision model via `VANTA_VISION_MODEL` (+ optional `VANTA_VISION_PROVIDER`) when set, else the active provider. This is the **auxiliary-task** pattern — image work runs on a vision-capable model even when the main model is text-only (DeepSeek, local Ollama). Unset = active provider (prior behavior).

**Brain (selfhood):** `brain/regions.ts` + `brain/store.ts` → `~/.vanta/brain/<region>.md` (identity[neurodivergent-first]/semantic/episodic/user_model/drives[frugality]/reflections/mood), git-versioned. `brain` tool (list/read/append/replace). `brainDigest` injected as a prompt tier — Vanta reads its brain each session.

**Skills:** skill INDEX injected into the prompt (`prompt.ts` skillsTier); `recall` loads the full body on demand.

**Memory:** stored file capped per goal (`VANTA_MEMORY_MAX_BLOCKS`, default 50; older blocks git-retained).

**Delegate:** `provider`/`model` params → agent routes a subtask to any backend (e.g. local ollama). `delegateEnv` overlays the choice.

**Kernel safety (`src/safety.rs`):** hardened — `normalize_cmd` (strips quote/backslash escapes), broadened destructive set, arbitrary-exec vectors (interpreters/eval/pipe/egress) → ASK, absolute-path-outside-root → ASK. Closes bypassable-denylist holes identified in prior-agent audit.

**Phase 2 EF gates (2026-06-04):** All gates are best-effort, non-blocking, wrapped in try/catch. Post-turn gates (inhibit, set-shift) live as session-scoped state refs in `interactive.ts` + `ui/use-agent.ts`, mirroring the `researchGateRef` pattern. Pre-turn gate (closure-gate) fires inside `runUserTurn` / `sendToAgent` alongside complexity-gate and topic-shift check. In-loop gates (self-monitor, error-detect) live in `agent.ts dispatchTool` / `runTurn`. New env overrides: `VANTA_INHIBIT_THRESHOLD` · `VANTA_SETSHIFT_THRESHOLD`. `handlers.ts` MUST STAY at 300 lines — new slash handlers go in own files, trade a blank line for the import.

**TUI/REPL commands:** `/history /retry /undo /reset /title /fork /goal /usage /copy /update /image /paste /attachments /next /planmode /where /wm /moim /restart /bug /handoff /open` (+ prior model/tools/skills/status/goals/sessions/resume/cron). Composer = custom readline (`ui/composer.tsx`, Ctrl+U/W/Esc-abort, up/down history, shift+enter multiline). `@file` autocomplete in TUI → inlines file content as context on submit. Markdown rendering in transcript. Domain-grouped banner (`term/capabilities.ts`). Braille spinners (`VANTA_SPINNER`). Drag-and-drop roadmap board: `vanta roadmap serve` → `http://localhost:7789/roadmap/board`.

**Env added:** `VANTA_MEMORY_MAX_BLOCKS` · `VANTA_SPINNER` (orbit|dots|pulse|snake|wave). Prompt rule 8 = token/power frugality (prefer local ollama for simple work).

**Docs:** `MANIFESTO.md` (north star) · `docs/parity-audit.md` · `docs/claude-cli-gaps.md` · `docs/issues-map.md` · `ROADMAP.md` v1.1–v1.5 (parity + UX + autonomy/senses + selfhood + efficiency).

## Session additions (2026-06-05) — keep current

**AUX-VISION (auxiliary-task vision routing):** `routing/vision.ts` — `visionEnv` (pure) + `resolveVisionProvider`. All three image tools (`describe_image`, `look_at_screen`, `look_at_camera`) now resolve via it: a dedicated vision model from `VANTA_VISION_MODEL` (+ optional `VANTA_VISION_PROVIDER`) when set, else the active provider (prior behavior). Fixes vision silently breaking when the main model is text-only (DeepSeek V4 Flash, local Ollama). The removed `VANTA_VISION_MODEL` is **back**, with new opt-in aux-routing semantics. Next: `AUX-MAP` generalizes this to a per-function model map (vision · summarize · title · embed).

**TUI readability fixes:** terminal width fills (no col cap in `ui/app.tsx`) · slash palette capped to 8 matches (was unbounded → typing `/` dumped all 37) · palette rewritten to a fixed command column + width-clipped one-line descriptions (`ui/slash-palette.tsx` `clip`) instead of ragged `space-between` · `/skills` output aligns names + clips descriptions to one line (`repl/handlers.ts`) · skill INDEX in the system prompt clips each description to ~100 chars (`prompt.ts` `trimSkillDesc`) so weak models stop parroting the whole library.

**Env added:** `VANTA_VISION_MODEL` · `VANTA_VISION_PROVIDER` (auxiliary vision routing; documented in `.env.example`).

**Messaging setup wizard (MSG-WIZARD + MSG-REGISTRY):** `gateway/platforms/registry.ts` — `MESSAGING_CATALOG` (the messaging analogue of `providers/catalog.ts`): `{id,label,implemented,requiredEnv,secretEnv?,enableEnv?,prerequisite?,warning?,setupSteps,signupUrl?}` + `platformAvailability(p,env)` + `messagingPlatformById`. **Only Telegram is `implemented`** (live adapter); iMessage/Signal/WhatsApp are `planned` (preview-only — the wizard never writes a fake enable flag for a missing adapter). `setup-messaging.ts` — `vanta setup messaging`: registry-driven menu with `[available|configured|planned]` status, `renderSetupSteps` (prereq + ⚠ warning + numbered steps), configures Telegram for real (`VANTA_TELEGRAM_TOKEN` via the shared `upsertEnv`, exported `promptSecret` from `setup.ts`). Wired in `cli.ts` (`setup` → `messaging` subcommand). Future adapters (iMessage osascript+chat.db, Signal signal-cli, WhatsApp Node bridge) flip `implemented:true` + add their adapter. Design: `docs/messaging-gateways.md`.

**Multi-source skill install:** `skills/library.ts` installs from `librarySources()` = **three** bundled dirs: `vanta-ts/skills-library/` (nd-* + ported references), the repo-root `design-system-skills/` (27 design skills + viewer), and `ai-engineering-skills/` (13 production-LLM/agent-engineering skills + viewer). The extra libraries stay in their showcase folders (not duplicated) and auto-install into `~/.vanta/skills` each session via `installSkillLibrary()`. `installOne()` helper keeps the fn small; `from` still overrides to a single source (tests). Adding a skill source = one entry in `librarySources()`. Each library's `index.html` regenerates via `scripts/build-skills-index.py <folder>` (mistune); they're also installed into `~/.claude/skills` for Claude Code.

## Session additions (2026-06-07) — keep current

Autonomous roadmap-grind session: 20 cards shipped (statuses + per-card notes in `roadmap.json`). **1216 TS + 27 Rust tests green; tsc clean; 46 registered tools.** New files are in the file-map table above. Highlights:

- **Code-size discipline:** CODE-SIZE-GATE (`lint/size.ts` analyzeSource via TS compiler API: file≤300/fn≤50/params≤4/cx≤10) → `vanta lint [--staged]` + warn-only pre-commit (`VANTA_LINT_BLOCK=1` enforces) + **in-agent**: `write_file` runs the gate on every TS write and surfaces violations in the result so the agent born-small/self-corrects. Surfaced 85 pre-existing violations (debt for a paydown card). CC-EDITOR (`editor/open.ts` + `vanta open` + `/open`).
- (earlier in the session):

- **Continuity:** `repl/handoff-cmd.ts` (`/handoff` + shared `assembleHandoff`) + `repl/auto-handoff.ts` (AUTO-HANDOFF: writes `.vanta/handoff.md` at context fill ≥ threshold, `prepareRun` reloads + consumes it on interactive launches only — gated on `instruction === "interactive session"`).
- **Operator:** GOAL-ACTION (vague goal auto-fires `/next` via `isVagueGoal`+`buildNextStepResend`), STALL-UNBLOCK (`repl/stall.ts` post-turn gate), MODE-DETECT (`repl/mode-detect.ts` auto stance, prepends a hint to the SENT message), `/restart` (`repl/restart-cmd.ts` exit 75 + `run.sh` relaunch loop), `/bug` (`repl/bug-cmd.ts`).
- **Reliability:** TOOL-RETRY (`tool-retry.ts`, safe retry of idempotent reads in `agent.ts dispatchTool`), ACTION-PROOF (`write_file` re-reads + verifies post-write), COST-VISIBLE (`pricing.ts` per-turn footer + session split on `ReplState.sessionCost`).
- **Model fix:** UX-MODEL-FIX — `upsertEnvMigratingLegacy` (`setup.ts`) strips the stale `ARGO_*` twin on any model write (root cause of "stuck on codex"); `/model <arg>` now hot-swaps + persists (`repl/model-cmd.ts`).
- **Prompt rules:** rule 10 = Voice (BEHAVIOR-VOICE); rules 1/4/7 folded in REF-FIDELITY / VERIFY-RIGHT + BETTER-ENDINGS / TRUST-LABELS (no new rule numbers — folding avoids prompt bloat).
- **Tooling:** `roadmap_add` tool + `roadmap/add.ts`.

**Env added:** `VANTA_TOOL_RETRIES` · `VANTA_STALL_THRESHOLD` · `VANTA_MODE_DETECT` · `VANTA_AUTOHANDOFF` / `VANTA_AUTOHANDOFF_THRESHOLD` · `VANTA_GOAL_ACTION` · `VANTA_RELAUNCH` (set by run.sh) · `VANTA_LINT_BLOCK` (pre-commit size enforce) · `VANTA_EDITOR` (CC-EDITOR). All documented in `.env.example`.

**Gotcha:** run `git` from the repo ROOT — the `tsx`/test commands `cd` into `vanta-ts/` and the shell cwd persists. `roadmap.html` is gitignored (regenerate via `roadmap/build.ts buildRoadmap`).
