# CLAUDE.md — argo-ts (agent layer)

The TypeScript agent loop. Read root `../CLAUDE.md` for the kernel + project overview. This file is the agent layer's source of truth — don't re-read every file to learn the structure; it's mapped here.

## Runtime

Node 22, ESM, `"type": "module"`. Run via `tsx` (no build step). Native `fetch`, `process.loadEnvFile` — **no dotenv, no axios.** Relative imports use `.js` extensions (ESM convention; tsx resolves to `.ts`). **TUI** uses React/Ink 7 (`jsx: react-jsx` automatic runtime — components don't import React; `.tsx` runs under tsx + vitest). Deps: `ink`, `react`, `ink-text-input`.

## File map (`src/`)

| File | Responsibility |
|------|----------------|
| `types.ts` | Core types: `Message`, `ToolCall`, `Verdict`, `Goal`, `Risk` |
| `providers/interface.ts` | `LLMProvider` interface, `ToolSchema`, `CompletionResult`. Non-streaming (see decisions) |
| `providers/openai.ts` | OpenAI **+ Ollama/Gemini/OpenRouter** (same SDK, `baseURL` swap). Converts internal↔OpenAI shapes. **`stream()`** (token deltas) + pure `foldToolCallDeltas` |
| `tui/app.tsx` | The Ink/React TUI: App component only — wires hooks, JSX, palette logic, submit. Delegates state to `app-reducer.ts` and agent I/O to `use-agent-send.ts` |
| `tui/app-reducer.ts` | `State`, `Action`, `reduce` — pure reducer for the TUI transcript (tested via `app.test.tsx`) |
| `tui/use-agent-send.ts` | `useAgentSend` hook — `sendToAgent` fn, queue-drain effect, Esc-abort `useInput`. Returns `{sendToAgent, abortRef}` |
| `tui/markdown.tsx` | `renderMarkdown` — minimal Ink markdown renderer: headers, fenced code, bullets, numbered, inline **bold** + `code`. Pure `tokenizeInline` + `parseBlocks` (tested) |
| `tui/at-context.ts` | U2 @-context: `parseAtRefs`, `activeAtRef`, `buildContextBlock`, `listRepoFiles` (depth-3 repo walk, skips build dirs). Powers TUI @ autocomplete + submit context injection |
| `tui/launch.tsx` | `runTui(repoRoot)` — prepareRun + maybeCurate + `render(<App/>)`. `argo` uses it on a TTY; readline REPL is the fallback |
| `providers/index.ts` | `resolveProvider(env)` — reads `ARGO_PROVIDER`/`ARGO_MODEL`. openai/ollama/anthropic/**gemini**/**openrouter**/**claude-code** (gemini+openrouter = OpenAI adapter w/ baseURL swap; claude-code = Anthropic adapter w/ OAuth token) |
| `providers/claude-code-auth.ts` | v1 G1 — `resolveClaudeCodeToken` reads a Claude Pro/Max OAuth token (env or `~/.claude/.credentials.json`), `isTokenExpired`. **Grey area** (ToS); `ARGO_PROVIDER=claude-code`. No refresh (Claude Code keeps creds fresh). See DECISIONS 2026-06-02 |
| `providers/catalog.ts` | `PROVIDER_CATALOG` — small shared `{id,label,envVar,defaultModel,signupUrl}` list the setup wizard + `doctor` read. **Not** the full registry (deferred); extend alongside `resolveProvider` |
| `setup.ts` | `argo setup` first-run wizard. Pure `upsertEnv(existing, updates)` (merges into `.env`, preserves other keys) + `buildEnvUpdates` + interactive `runSetup(repoRoot, rl?)` (hidden key prompt, 0600 write) |
| `status.ts` | `argo status`/`doctor`. Pure `formatStatus(report)` + `gatherStatus(env)` (kernel **ping only**, provider try/catch, key **presence**, store/goal counts) |
| `safety-client.ts` | `fetch` client → kernel. `assess/getGoals/proposeApproval/approve/deny/logEvent/status`. Zod-validates responses |
| `kernel-launcher.ts` | `ensureKernel()` — ping, else spawn detached with `ARGO_ROOT` + cwd, poll 5s |
| `scope.ts` | `resolveInScope(target, root)` — path containment, mirrors kernel's `inside_scope` |
| `tools/types.ts` | `Tool` (schema + optional `describeForSafety` + `execute`), `ToolContext`, `ToolResult` |
| `tools/registry.ts` | `ToolRegistry`: register/get/list/schemas |
| `tools/roadmap-move.ts` | KANBAN — `roadmap_move` tool. Moves a roadmap item to a new status, writes `roadmap.json`, regenerates HTML. `describeForSafety` → kernel Allow |
| `roadmap/move.ts` | `moveRoadmapItem(repoRoot, id, toStatus)` — pure fn: read → validate → patch → write → rebuild |
| `roadmap/server.ts` | KANBAN-S2 — `createRoadmapServer(repoRoot)` (Node http) + `serveRoadmap(repoRoot, port)`. Routes: `GET /roadmap/board` (serves roadmap.html), `POST /roadmap/move` → `moveRoadmapItem`. `argo roadmap serve` wires this |
| `tools/clarify.ts` | ND2 — `clarify` tool. Agent calls this when intent is ambiguous. Returns a formatted question (+ optional numbered choices) as `output`; the model surfaces it in its reply and awaits the next turn. End-of-turn design: no `ToolContext` changes. `describeForSafety` → "ask user a clarifying question" → kernel Allow |
| `tools/{read-file,write-file,shell-cmd,inspect-state}.ts` | The four v0 tools. `write-file` writes in-repo freely / out-of-repo only into a **writable zone**; `read-file` reads in-repo freely / out-of-repo only from a **readable zone** (both approval-gated by the kernel) |
| `tools/writable-zones.ts` | SCOPE-1/2 — `resolveWritableZones` (write_file: `~/Desktop`+`~/Downloads`, `ARGO_WRITABLE_DIRS`) · `resolveReadableZones(env,root)` (read_file: project's parent dir + writable zones, `ARGO_READABLE_DIRS`) · `isInZone`/`expandHome`. Kernel still Asks per out-of-root access; the zone lists are the backstop bounding where an approved access lands |
| `tools/{web-search,web-fetch}.ts` | Phase 2B web tools. `web-fetch` exports pure `extractReadable(html,url)` |
| `tools/{write-skill,recall}.ts` | Phase 2A learning tools. `describeForSafety` is a constant internal-op string (no path/query → kernel `Allow`) |
| `tools/{screenshot,browser-navigate,browser-extract}.ts` | Phase 3 browser tools (lazy `playwright-core`). Allowlist + `requestApproval` for new domains. `browser-extract` exports pure `extractFromHtml` |
| `tools/describe-image.ts` | Phase 3 vision — OpenAI vision model on a scoped image (`ARGO_VISION_MODEL`, default gpt-4o-mini) |
| `tools/run-code.ts` | Phase 4 — run python/node/rust in an isolated temp dir, timeout, **approval-gated** |
| `tools/lsp.ts` + `lsp/ts-service.ts` | Phase 4 — diagnostics + go-to-definition for .ts/.tsx via the **TS compiler API** (no separate language server) |
| `tools/git.ts` | Phase 4 — 6 git tools. status/diff read-only; commit/push/branch/checkout call `requestApproval` (risk:ask) |
| `browser/allowlist.ts` | `isAllowedDomain`/`extractDomain` — `ARGO_ALLOWED_DOMAINS` gate for browser tools |
| `providers/anthropic.ts` | Phase 4 full Anthropic adapter (lazy `@anthropic-ai/sdk`, default `claude-sonnet-4-6`). Pure `toAnthropicMessages` |
| `tools/delegate.ts` | Phase 6 — spawns a scoped subagent. Child registry excludes `delegate` (no runaway recursion) |
| `schedule/cron.ts` | Phase 6 — `isDue` (5-field cron) + `.argo/cron.tsv` load/add/save |
| `schedule/runner.ts` | Phase 6 — `runDueTasks({dataDir, now, run})` runs due active tasks; one failure doesn't abort the batch |
| `schedule/commands.ts` | Phase 6 — `argo schedule`/`cron` CLI handlers (extracted to keep cli.ts ≤300) |
| `gateway/run.ts` | v1 E1/E2/E3 — `argo gateway` daemon: `gatewayTick` (cron) + `pollPlatform` (messaging) + webhook listener, in one `runGateway` loop (SIGINT/SIGTERM-clean). `ARGO_GATEWAY_TICK_MS` |
| `gateway/webhook.ts` | v1 E3 — pure `verifyGithubSignature` (HMAC sha256, constant-time) + `resolveDeliver` (local/file/telegram) + `startWebhookServer` (POST, HMAC-gated, 200-fast). `ARGO_WEBHOOK_PORT`/`_SECRET`/`_PROMPT`/`_DELIVER` |
| `service/launchd.ts` + `service/manager.ts` | v1 E1 — pure `buildLaunchdPlist` + `argo service install\|uninstall\|status` (launchd user agent that keeps `argo gateway` alive; captures PATH). macOS only for now |
| `gateway/platforms/base.ts` | v1 E2 — `PlatformAdapter` contract (`connect`/`disconnect`/`send`/`poll`) + `InboundMessage`/`OutboundMessage`. One adapter per messaging platform |
| `gateway/platforms/telegram.ts` | v1 E2 — `TelegramAdapter` (getUpdates long-poll + sendMessage, no SDK) + pure `parseUpdates`/`parseAllowlist`. `gateway/run.ts pollPlatform` runs inbound→agent→reply. Enabled by `ARGO_TELEGRAM_TOKEN`; offline-tested, live needs a @BotFather token |
| `mcp/client.ts` | v1 E5 — dependency-free MCP stdio JSON-RPC client (`McpClient` + injectable `Transport` + `stdioTransport`): initialize/listTools/callTool, concurrent-request correlation. `textFromContent` pure |
| `mcp/mount.ts` | v1 E5 + MCP-1 — `readMcpConfig` (accepts `servers`+`mcpServers` keys; resolves `ARGO_MCP_SERVERS` inline, else merges `./.mcp.json` project-level over `~/.argo/mcp.json` user-level) + `mountMcpServers` (spawn each, register discovered tools as Vanta tools via `mcpToolToArgoTool` — gated by kernel `assess()`). Called in `prepareRun`; no-op without config |
| `mcp/server.ts` | MCP-3 — Vanta AS an MCP server (mirror of client.ts). `runMcpServer`/`stdioServerTransport` + pure `handleMessage` (initialize/tools/list/tools/call). Every call gated by `assess()`: `block`/`ask` → `isError` result (headless, no human), only `allow` executes. `resolveServeAllowlist` (`ARGO_MCP_SERVE_TOOLS`, default 9 read-only) bounds exposure. `argo mcp serve` |
| `tools/mount-mcp.ts` | MCP-2 — `buildMountMcpTool(registry)` factory: the `mount_mcp` tool spawns an MCP server at runtime + registers its tools into the LIVE registry. `describeForSafety` → "spawn mcp server …" so the kernel gates the spawn. Registered by `buildRegistry` (needs the registry ref) |
| `subagent/spawn.ts` | Phase 6 — `spawnSubagent` runs an isolated worker (own goal/prompt/iter budget), returns verified outcome only |
| `a2a/{types,local}.ts` | Phase 6 — local in-process A2A message bus (`A2ABus`, `makeMessage`). Networked transport = future |
| `projects/rooms.ts` | Phase 7 — `listRooms`/`resolveRoom` over `ARGO_PROJECTS_DIR` (default `~/Documents/GitHub/_active`). `argo room <name>` runs rooted there → per-project goal stream |
| `projects/commands.ts` | Phase 7 — `argo rooms`/`room`/`modes` CLI handlers + learning suggestion (keeps cli.ts ≤300) |
| `modes/builtin.ts` | Phase 7 — 6 operator modes as real skills (`OPERATOR_MODES`, `installModes`). Run via `argo skill <mode> "<instr>"` |
| `modes/learning.ts` | Phase 7 — `recordRun`/`shouldProposeSkill`; after a pattern recurs 3× proposes capturing it as a skill (`~/.argo/usage.tsv`) |
| `routing/model-router.ts` | Phase 7 — `classifyTask` (cheap/expensive) + `resolveRoutedProvider` (`ARGO_MODEL_CHEAP`/`_EXPENSIVE`; no-op when unset) |
| `routing/vision.ts` | AUX-VISION — `visionEnv` (pure) + `resolveVisionProvider`: image tools resolve a dedicated vision model via `ARGO_VISION_MODEL` (+ optional `ARGO_VISION_PROVIDER`), else the active provider. Used by `describe_image`/`look_at_screen`/`look_at_camera` so a text-only main model doesn't break sight. The auxiliary-task pattern, scoped to vision |
| `google/auth.ts` | Phase 5 — one-time OAuth (`runGoogleAuth`, loopback) + token store `~/.argo/google-tokens.json` (0600), `getAccessToken` (auto-refresh) |
| `google/client.ts` | Phase 5 — `googleFetch` (Bearer + 401-retry) + pure `buildUrl` |
| `tools/gmail.ts` | Phase 5 — `gmail_search`/`gmail_read` (read) + `gmail_draft`/`gmail_send` (always approval-gated) |
| `tools/calendar.ts` | Phase 5 — `calendar_read` + `calendar_create`/`calendar_update` (approval-gated) |
| `tools/drive.ts` | Phase 5 — `drive_read` + `drive_create`/`drive_update` (approval-gated). Pure `buildMultipartBody` |
| `tools/index.ts` | `buildRegistry({exclude?})` — registers all 42 tools + `mount_mcp` via factory = 43 total (`exclude:["delegate"]` → 41 for workers) |
| `store/home.ts` | `resolveArgoHome`/`skillsDir`/`memoriesDir`/`slugifySkillName`/`ensureArgoStore`/`commitInHome`. The global `~/.argo` store (`ARGO_HOME` override), git-init'd for free versioning |
| `skills/types.ts` | `Skill`, `SkillMeta`, `SkillMatch` |
| `skills/frontmatter.ts` | pure `parseSkill`/`serializeSkill` (flat YAML frontmatter, Hermes-compatible) |
| `skills/store.ts` | `writeSkill`/`readSkill`/`listSkills` — `~/.argo/skills/<slug>/SKILL.md`, auto-commits. `LEARNED_TAG` provenance constant |
| `skills/library.ts` | `installSkillLibrary({force,from})` — copies bundled `skills-library/` into `~/.argo/skills` (idempotent, skips existing unless `--force`). `libraryDir()` resolves to `argo-ts/skills-library/`. Called by `argo skills install` **and auto-run in `prepareRun`** every session, so newly-bundled skills appear without a manual install |
| `skills-library/` | **26** shipped skills at `argo-ts/skills-library/<slug>/SKILL.md`: ~10 ported from references + `agent-orchestration-workflows`, `build-mcp-server`, and the **14 `nd-*` executive-function skills**. Add a `<slug>/SKILL.md` dir to grow the bundle; it auto-installs on next session |
| `skills/recall.ts` | pure `searchSkills(query, skills)` — weighted substring ranking |
| `skills/curator.ts` | `curate()` — **non-destructive**: archives only stale `argo-learned` skills (reversible→`_archive`), reports stale hand-authored + long-archived (never deletes), reports overlaps. Provenance via `LEARNED_TAG` |
| `review/background-review.ts` | Track B self-improvement. `shouldReview(toolIters, turnIdx, env)` (busy/periodic trigger) + `reviewTurn()` — spawns a tool-restricted agent (`recall`+`write_skill`), replays the transcript, captures a skill tagged `argo-learned`. Best-effort. Env: `ARGO_SELF_IMPROVE`/`ARGO_REVIEW_MIN_TOOLS`/`ARGO_REVIEW_EVERY` |
| `memory/store.ts` | `appendMemory`/`readMemory`/`recentMemory` — per-goal summaries `~/.argo/memories/<goalId>.md` |
| `sessions/store.ts` | Session persist/resume: `saveSession`/`loadSession`/`listSessions`/`newSessionId`. JSON files `~/.argo/sessions/<id>.json` (id `YYYYMMDD-HHMMSS`), zod-validated. `argo sessions`/`resume <id>`/`--resume`. `createConversation(...,{history})` seeds resumed turns |
| `search/interface.ts` | `SearchProvider` interface, `SearchResult`, `SearchConfig`, `DEFAULT_MAX_RESULTS` |
| `search/{duckduckgo,searxng,serpapi,brave}.ts` | Search adapters. Each exports a `*Provider` class + a pure mapper/parser for testing |
| `search/index.ts` | `resolveSearchProvider(env)` — reads `ARGO_SEARCH_PROVIDER`. Mirrors `providers/index.ts` |
| `prompt.ts` | `buildSystemPrompt()` — tiers: stable (SOUL+tools+rules) / brain / skills / context / `errorsLogTier` (ERRORS.md, capped 3k) / volatile (goals+time+memory) |
| `context.ts` | `trimMessages()` (fallback) + `compressMessages(msgs, ctx, summarize, {activeGoalText?})` — injects goal-reminder note after system messages when `activeGoalText` is set |
| `agent.ts` | `createConversation()` + `runAgent()` + `dispatchTool()`. `AgentDeps`: `activeGoalText?` (goal re-injection), `onIterationCheck?` (consecutive failure hook). `dispatchTool` runs EF-SELFMONITOR heuristic before `tool.execute`. `runTurn` tracks `consecutiveErrorResults` → `onText` note at threshold |
| `session.ts` | Shared run setup for one-shot + interactive: `prepareRun` (reads ERRORS.md → `errorsLog`), `buildSummarizer`, `writeRunMemory`, `consoleCallbacks`, `approver`, **`maybeCurate`**, **`reviewAfterTurn`**, `researchGateAfterTurn`, `inhibitAfterTurn`, `setShiftAfterTurn`. Neither cli.ts nor interactive.ts imports the other |
| `interactive.ts` | `renderBanner` (logo, model, goals, tool + skill inventory) + `runChat` (the REPL: one `createConversation`, history persists; slash commands via repl-commands.ts; session save + post-turn review) |
| `repl-commands.ts` | REPL slash commands dispatcher — re-exports `SLASH_COMMANDS`, `executeSlash`, `runSlashCommand`. Handlers live in `repl/handlers.ts` |
| `repl/catalog.ts` | `SLASH_COMMANDS` array + `SLASH_HELP` — canonical command list driving `/help`, TUI palette, and validation |
| `repl/handlers.ts` | `HANDLERS` registry + `dispatch(cmd, arg, ctx)` — every slash handler, each a `SlashHandler` const |
| `repl/next.ts` | ND1 — `next` handler: reads active kernel goals → `resend` prompt asking agent for one concrete next micro-step |
| `repl/plan-mode.ts` | ND3 — `planMode` handler: toggles plan-first mode via `PLAN_MARKER` injection into live system prompt (`/planmode [on|off]`) |
| `repl/where.ts` | EF-WORKINGMEM — `/where` handler: `lastIntent` (last user message) + `lastToolCalls` (last 5 tool names) as a breadcrumb |
| `repl/inhibit.ts` | EF-INHIBIT — `InhibitState` + `nextInhibitState`/`shouldAlertInhibit`/`buildInhibitText`. Post-turn drift counter (3 consecutive non-output turns → alert). `ARGO_INHIBIT_THRESHOLD` override |
| `repl/set-shift.ts` | EF-SETSHIFT — `SetShiftState` + `getPrimaryTool`/`nextSetShiftState`/`shouldAlertSetShift`. Post-turn stuck-loop detector (same primary tool 3 turns → alert). `ARGO_SETSHIFT_THRESHOLD` override |
| `repl/self-monitor.ts` | EF-SELFMONITOR — `isDestructiveAction`/`isAdditiveGoal`/`shouldWarn`/`buildSelfMonitorText`. Synchronous pre-execution heuristic in `dispatchTool`; fires via `deps.onText` (zero LLM, never blocks) |
| `repl/error-detect.ts` | EF-ERRORDETECT — `isErrorResult`/`buildErrorDetectText`. Consecutive `ok:false` or error-keyword results tracked in `runTurn`; at 3 fires `onText` note + `deps.onIterationCheck?` callback |
| `repl/closure-gate.ts` | EF-CLOSUREGATE — `extractWrittenFiles`/`hasCommitAfterIndex`/`getInProgressItems`/`buildClosureGateText`. On topic shift (same `isTopicShift` check), surfaces unclosed write_file calls without a subsequent commit |
| `cli.ts` | `argo` (no args)/`chat` → `startInteractive` (runs `setup` wizard first if no backend resolves, **TTY-gated**); `argo setup\|status\|doctor\|run\|skills\|skill\|schedule\|cron\|rooms\|room <name> [instr]\|modes [list\|install]\|auth google`: env, kernel+store, **routed** provider, memory inject, run, post-run memory + learning suggestion. `cron` is OS-scheduler-invoked |

## The loop (`agent.ts`)

```
messages = [system, user]
each iteration (max ARGO_MAX_ITER=50):
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

`ARGO_PROVIDER` (openai|ollama|anthropic) · `ARGO_MODEL` · `OPENAI_API_KEY` · `ARGO_OLLAMA_URL` · `ARGO_KERNEL_URL` · `ARGO_MAX_ITER`. Defaults in `.env.example`. Local `.env` (gitignored) defaults to Ollama qwen2.5:14b.

Search (Phase 2B): `ARGO_SEARCH_PROVIDER` (ddg|searxng|serpapi|brave, default ddg) · `ARGO_SEARCH_URL` (searxng) · `SERPAPI_KEY` · `BRAVE_KEY`.

Store (Phase 2A): `ARGO_HOME` overrides the global store dir (default `~/.argo`). Holds `skills/` + `memories/`, git-init'd; writes auto-commit (best-effort). Tests point `ARGO_HOME` at a temp dir.

Phase 3/4: `ANTHROPIC_API_KEY` (anthropic provider) · `ARGO_VISION_MODEL` (describe_image, default gpt-4o-mini) · `ARGO_ALLOWED_DOMAINS` (comma list; browser tools prompt-approve unlisted domains). Browser tools need `npx playwright install chromium` for live use (degrade gracefully without it). LSP tools cover .ts/.tsx only.

Phase 7: `ARGO_PROJECTS_DIR` (project rooms, default `~/Documents/GitHub/_active`) · `ARGO_MODEL_CHEAP` / `ARGO_MODEL_EXPENSIVE` (task-routed models; unset = no routing).

Phase 5 (comms): `ARGO_GOOGLE_CLIENT_ID` + `ARGO_GOOGLE_CLIENT_SECRET` (one-time OAuth client — provision once in Google Cloud Console, then `argo auth google` is one click per user). Tokens stored per-user in `~/.argo/google-tokens.json`. Every outbound (send/draft/create/update) is always approval-gated. Comms tools are offline-unit-tested only; live use needs the OAuth client + consent.

## Gotchas

- **gitleaks pre-commit hook** runs `gitleaks protect --staged` on every commit. Hook lives at `scripts/pre-commit`; `install.sh` symlinks it into `.git/hooks/`. Example files (`.env.example`, `.mcp.json.example`) and test fixtures are allowlisted in `.gitleaks.toml`. If you get a false positive, add a pattern to the `allowlists` section — don't skip the hook.

- **DDG html endpoint 403s from datacenter / flagged IPs.** The `duckduckgo` adapter and its parser are correct (unit-tested), but `html.duckduckgo.com` / `lite.duckduckgo.com` block scrapers by IP — verified 403 from this dev environment on every endpoint/header/verb combo. Not a code bug. For reliable search off a residential IP, use Searxng (self-host) or Brave/SerpAPI. `web-fetch` is unaffected (verified live: example.com + Wikipedia → clean Readability markdown).

## Session additions (2026-06-02/03) — keep current

**Providers:** `ARGO_PROVIDER` now also: `gemini` · `openrouter` · `codex` (alias `openai-codex`, ChatGPT-subscription OAuth via `~/.codex/auth.json`, Responses API — `providers/codex.ts`+`codex-auth.ts`) · `claude-code` (Claude sub OAuth). Catalog: `providers/catalog.ts`.

**Multimodal:** user `Message` carries optional `images:[{mime,dataBase64}]` (`types.ts`), mapped natively by every provider. Attach via `/image <path>`, `/paste` (clipboard, macOS), drag-drop (`maybeDroppedImage`), or `/attachments [clear]`. Vision tools `describe_image` + `look_at_screen`/`look_at_camera` (Vanta's eyes) route through `resolveVisionProvider` (`routing/vision.ts`): a dedicated vision model via `ARGO_VISION_MODEL` (+ optional `ARGO_VISION_PROVIDER`) when set, else the active provider. This is the **auxiliary-task** pattern — image work runs on a vision-capable model even when the main model is text-only (DeepSeek, local Ollama). Unset = active provider (prior behavior).

**Brain (selfhood):** `brain/regions.ts` + `brain/store.ts` → `~/.argo/brain/<region>.md` (identity[neurodivergent-first]/semantic/episodic/user_model/drives[frugality]/reflections/mood), git-versioned. `brain` tool (list/read/append/replace). `brainDigest` injected as a prompt tier — Vanta reads its brain each session.

**Skills:** skill INDEX injected into the prompt (`prompt.ts` skillsTier); `recall` loads the full body on demand.

**Memory:** stored file capped per goal (`ARGO_MEMORY_MAX_BLOCKS`, default 50; older blocks git-retained).

**Delegate:** `provider`/`model` params → agent routes a subtask to any backend (e.g. local ollama). `delegateEnv` overlays the choice.

**Kernel safety (`src/safety.rs`):** hardened — `normalize_cmd` (strips quote/backslash escapes), broadened destructive set, arbitrary-exec vectors (interpreters/eval/pipe/egress) → ASK, absolute-path-outside-root → ASK. Closes the bypassable-denylist holes (Hermes #36846/#36645).

**Phase 2 EF gates (2026-06-04):** All gates are best-effort, non-blocking, wrapped in try/catch. Post-turn gates (inhibit, set-shift) live as session-scoped state refs in `interactive.ts` + `tui/use-agent-send.ts`, mirroring the `researchGateRef` pattern. Pre-turn gate (closure-gate) fires inside `runUserTurn` / `sendToAgent` alongside complexity-gate and topic-shift check. In-loop gates (self-monitor, error-detect) live in `agent.ts dispatchTool` / `runTurn`. New env overrides: `ARGO_INHIBIT_THRESHOLD` · `ARGO_SETSHIFT_THRESHOLD`. `handlers.ts` MUST STAY at 300 lines — new slash handlers go in own files, trade a blank line for the import.

**TUI/REPL commands:** `/history /retry /undo /reset /title /fork /goal /usage /copy /update /image /paste /attachments /next /planmode /where` (+ prior model/tools/skills/status/goals/sessions/resume/cron). Composer = custom readline (`tui/composer.tsx`, Ctrl+U/W/Esc-abort, up/down history, shift+enter multiline). `@file` autocomplete in TUI → inlines file content as context on submit. Markdown rendering in transcript (`tui/markdown.tsx`). Domain-grouped banner (`tui/capabilities.ts`). Braille spinners (`tui/spinners.ts`, `ARGO_SPINNER`). Drag-and-drop roadmap board: `argo roadmap serve` → `http://localhost:7789/roadmap/board`.

**Env added:** `ARGO_MEMORY_MAX_BLOCKS` · `ARGO_SPINNER` (orbit|dots|pulse|snake|wave). Prompt rule 8 = token/power frugality (prefer local ollama for simple work).

**Docs:** `MANIFESTO.md` (north star) · `docs/parity-audit.md` · `docs/claude-cli-gaps.md` · `docs/hermes-issues-map.md` · `ROADMAP.md` v1.1–v1.5 (parity + UX + autonomy/senses + selfhood + efficiency).

## Session additions (2026-06-05) — keep current

**AUX-VISION (auxiliary-task vision routing):** `routing/vision.ts` — `visionEnv` (pure) + `resolveVisionProvider`. All three image tools (`describe_image`, `look_at_screen`, `look_at_camera`) now resolve via it: a dedicated vision model from `ARGO_VISION_MODEL` (+ optional `ARGO_VISION_PROVIDER`) when set, else the active provider (prior behavior). Fixes vision silently breaking when the main model is text-only (DeepSeek V4 Flash, local Ollama). The removed `ARGO_VISION_MODEL` is **back**, with new opt-in aux-routing semantics. Next: `AUX-MAP` generalizes this to a per-function model map (vision · summarize · title · embed).

**TUI readability fixes:** terminal width now fills (removed the 100-col cap in `tui/app.tsx`) · slash palette capped to 8 matches (`app.tsx`, was unbounded → typing `/` dumped all 37) · palette rewritten to a fixed command column + width-clipped one-line descriptions (`tui/transcript.tsx` `Palette` + `clip`) instead of ragged `space-between` · `/skills` output aligns names + clips descriptions to one line (`repl/handlers.ts`) · skill INDEX in the system prompt clips each description to ~100 chars (`prompt.ts` `trimSkillDesc`) so weak models stop parroting the whole library.

**Env added:** `ARGO_VISION_MODEL` · `ARGO_VISION_PROVIDER` (auxiliary vision routing; documented in `.env.example`).

**Messaging setup wizard (MSG-WIZARD + MSG-REGISTRY):** `gateway/platforms/registry.ts` — `MESSAGING_CATALOG` (the messaging analogue of `providers/catalog.ts`): `{id,label,implemented,requiredEnv,secretEnv?,enableEnv?,prerequisite?,warning?,setupSteps,signupUrl?}` + `platformAvailability(p,env)` + `messagingPlatformById`. **Only Telegram is `implemented`** (live adapter); iMessage/Signal/WhatsApp are `planned` (preview-only — the wizard never writes a fake enable flag for a missing adapter). `setup-messaging.ts` — `argo setup messaging`: registry-driven menu with `[available|configured|planned]` status, `renderSetupSteps` (prereq + ⚠ warning + numbered steps), configures Telegram for real (`ARGO_TELEGRAM_TOKEN` via the shared `upsertEnv`, exported `promptSecret` from `setup.ts`). Wired in `cli.ts` (`setup` → `messaging` subcommand). Future adapters (iMessage osascript+chat.db, Signal signal-cli, WhatsApp Node bridge) flip `implemented:true` + add their adapter. Design: `docs/messaging-gateways.md`.

**Multi-source skill install:** `skills/library.ts` installs from `librarySources()` = **three** bundled dirs: `argo-ts/skills-library/` (Hermes-ported + nd-*), the repo-root `design-system-skills/` (27 design skills + viewer), and `ai-engineering-skills/` (13 production-LLM/agent-engineering skills + viewer). The extra libraries stay in their showcase folders (not duplicated) and auto-install into `~/.argo/skills` each session via `installSkillLibrary()`. `installOne()` helper keeps the fn small; `from` still overrides to a single source (tests). Adding a skill source = one entry in `librarySources()`. Each library's `index.html` regenerates via `scripts/build-skills-index.py <folder>` (mistune); they're also installed into `~/.claude/skills` for Claude Code.
