# CLAUDE.md — argo-ts (agent layer)

The TypeScript agent loop. Read root `../CLAUDE.md` for the kernel + project overview. This file is the agent layer's source of truth — don't re-read every file to learn the structure; it's mapped here.

## Runtime

Node 22, ESM, `"type": "module"`. Run via `tsx` (no build step). Native `fetch`, `process.loadEnvFile` — **no dotenv, no axios.** Relative imports use `.js` extensions (ESM convention; tsx resolves to `.ts`).

## File map (`src/`)

| File | Responsibility |
|------|----------------|
| `types.ts` | Core types: `Message`, `ToolCall`, `Verdict`, `Goal`, `Risk` |
| `providers/interface.ts` | `LLMProvider` interface, `ToolSchema`, `CompletionResult`. Non-streaming (see decisions) |
| `providers/openai.ts` | OpenAI **+ Ollama** (same SDK, `baseURL` swap). Converts internal↔OpenAI message/tool shapes |
| `providers/index.ts` | `resolveProvider(env)` — reads `ARGO_PROVIDER`/`ARGO_MODEL`. openai/ollama/anthropic/**gemini**/**openrouter** (gemini+openrouter = OpenAI adapter w/ baseURL swap) |
| `providers/catalog.ts` | `PROVIDER_CATALOG` — small shared `{id,label,envVar,defaultModel,signupUrl}` list the setup wizard + `doctor` read. **Not** the full registry (deferred); extend alongside `resolveProvider` |
| `setup.ts` | `argo setup` first-run wizard. Pure `upsertEnv(existing, updates)` (merges into `.env`, preserves other keys) + `buildEnvUpdates` + interactive `runSetup(repoRoot, rl?)` (hidden key prompt, 0600 write) |
| `status.ts` | `argo status`/`doctor`. Pure `formatStatus(report)` + `gatherStatus(env)` (kernel **ping only**, provider try/catch, key **presence**, store/goal counts) |
| `safety-client.ts` | `fetch` client → kernel. `assess/getGoals/proposeApproval/approve/deny/logEvent/status`. Zod-validates responses |
| `kernel-launcher.ts` | `ensureKernel()` — ping, else spawn detached with `ARGO_ROOT` + cwd, poll 5s |
| `scope.ts` | `resolveInScope(target, root)` — path containment, mirrors kernel's `inside_scope` |
| `tools/types.ts` | `Tool` (schema + optional `describeForSafety` + `execute`), `ToolContext`, `ToolResult` |
| `tools/registry.ts` | `ToolRegistry`: register/get/list/schemas |
| `tools/{read-file,write-file,shell-cmd,inspect-state}.ts` | The four v0 tools |
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
| `gateway/run.ts` | v1 E1 — `argo gateway` foreground daemon: `gatewayTick` (run due cron tasks once) + `runGateway` (interruptible tick loop, SIGINT/SIGTERM-clean). `ARGO_GATEWAY_TICK_MS` |
| `service/launchd.ts` + `service/manager.ts` | v1 E1 — pure `buildLaunchdPlist` + `argo service install\|uninstall\|status` (launchd user agent that keeps `argo gateway` alive; captures PATH). macOS only for now |
| `gateway/platforms/base.ts` | v1 E2 — `PlatformAdapter` contract (`connect`/`disconnect`/`send`/`poll`) + `InboundMessage`/`OutboundMessage`. One adapter per messaging platform |
| `gateway/platforms/telegram.ts` | v1 E2 — `TelegramAdapter` (getUpdates long-poll + sendMessage, no SDK) + pure `parseUpdates`/`parseAllowlist`. `gateway/run.ts pollPlatform` runs inbound→agent→reply. Enabled by `ARGO_TELEGRAM_TOKEN`; offline-tested, live needs a @BotFather token |
| `mcp/client.ts` | v1 E5 — dependency-free MCP stdio JSON-RPC client (`McpClient` + injectable `Transport` + `stdioTransport`): initialize/listTools/callTool, concurrent-request correlation. `textFromContent` pure |
| `mcp/mount.ts` | v1 E5 — `readMcpConfig` (`ARGO_MCP_SERVERS` or `~/.argo/mcp.json`) + `mountMcpServers` (spawn each, register discovered tools as Argo tools via `mcpToolToArgoTool` — gated by kernel `assess()`). Called in `prepareRun`; no-op without config |
| `subagent/spawn.ts` | Phase 6 — `spawnSubagent` runs an isolated worker (own goal/prompt/iter budget), returns verified outcome only |
| `a2a/{types,local}.ts` | Phase 6 — local in-process A2A message bus (`A2ABus`, `makeMessage`). Networked transport = future |
| `projects/rooms.ts` | Phase 7 — `listRooms`/`resolveRoom` over `ARGO_PROJECTS_DIR` (default `~/Documents/GitHub/_active`). `argo room <name>` runs rooted there → per-project goal stream |
| `projects/commands.ts` | Phase 7 — `argo rooms`/`room`/`modes` CLI handlers + learning suggestion (keeps cli.ts ≤300) |
| `modes/builtin.ts` | Phase 7 — 6 operator modes as real skills (`OPERATOR_MODES`, `installModes`). Run via `argo skill <mode> "<instr>"` |
| `modes/learning.ts` | Phase 7 — `recordRun`/`shouldProposeSkill`; after a pattern recurs 3× proposes capturing it as a skill (`~/.argo/usage.tsv`) |
| `routing/model-router.ts` | Phase 7 — `classifyTask` (cheap/expensive) + `resolveRoutedProvider` (`ARGO_MODEL_CHEAP`/`_EXPENSIVE`; no-op when unset) |
| `google/auth.ts` | Phase 5 — one-time OAuth (`runGoogleAuth`, loopback) + token store `~/.argo/google-tokens.json` (0600), `getAccessToken` (auto-refresh) |
| `google/client.ts` | Phase 5 — `googleFetch` (Bearer + 401-retry) + pure `buildUrl` |
| `tools/gmail.ts` | Phase 5 — `gmail_search`/`gmail_read` (read) + `gmail_draft`/`gmail_send` (always approval-gated) |
| `tools/calendar.ts` | Phase 5 — `calendar_read` + `calendar_create`/`calendar_update` (approval-gated) |
| `tools/drive.ts` | Phase 5 — `drive_read` + `drive_create`/`drive_update` (approval-gated). Pure `buildMultipartBody` |
| `tools/index.ts` | `buildRegistry({exclude?})` — registers all 32 tools (`exclude:["delegate"]` → 31 for workers) |
| `store/home.ts` | `resolveArgoHome`/`skillsDir`/`memoriesDir`/`slugifySkillName`/`ensureArgoStore`/`commitInHome`. The global `~/.argo` store (`ARGO_HOME` override), git-init'd for free versioning |
| `skills/types.ts` | `Skill`, `SkillMeta`, `SkillMatch` |
| `skills/frontmatter.ts` | pure `parseSkill`/`serializeSkill` (flat YAML frontmatter, Hermes-compatible) |
| `skills/store.ts` | `writeSkill`/`readSkill`/`listSkills` — `~/.argo/skills/<slug>/SKILL.md`, auto-commits. `LEARNED_TAG` provenance constant |
| `skills/library.ts` | `installSkillLibrary({force,from})` — copies bundled `skills-library/` into `~/.argo/skills` (idempotent, skips existing unless `--force`). `argo skills install` |
| `../skills-library/` | 10 high-value skills ported from Hermes/OpenClaw (coupling stripped), shipped with Argo. Add more `<slug>/SKILL.md` dirs to grow the bundle |
| `skills/recall.ts` | pure `searchSkills(query, skills)` — weighted substring ranking |
| `skills/curator.ts` | `curate()` — **non-destructive**: archives only stale `argo-learned` skills (reversible→`_archive`), reports stale hand-authored + long-archived (never deletes), reports overlaps. Provenance via `LEARNED_TAG` |
| `review/background-review.ts` | Track B self-improvement. `shouldReview(toolIters, turnIdx, env)` (busy/periodic trigger) + `reviewTurn()` — spawns a tool-restricted agent (`recall`+`write_skill`), replays the transcript, captures a skill tagged `argo-learned`. Best-effort. Env: `ARGO_SELF_IMPROVE`/`ARGO_REVIEW_MIN_TOOLS`/`ARGO_REVIEW_EVERY` |
| `memory/store.ts` | `appendMemory`/`readMemory`/`recentMemory` — per-goal summaries `~/.argo/memories/<goalId>.md` |
| `sessions/store.ts` | Session persist/resume: `saveSession`/`loadSession`/`listSessions`/`newSessionId`. JSON files `~/.argo/sessions/<id>.json` (id `YYYYMMDD-HHMMSS`), zod-validated. `argo sessions`/`resume <id>`/`--resume`. `createConversation(...,{history})` seeds resumed turns |
| `search/interface.ts` | `SearchProvider` interface, `SearchResult`, `SearchConfig`, `DEFAULT_MAX_RESULTS` |
| `search/{duckduckgo,searxng,serpapi,brave}.ts` | Search adapters. Each exports a `*Provider` class + a pure mapper/parser for testing |
| `search/index.ts` | `resolveSearchProvider(env)` — reads `ARGO_SEARCH_PROVIDER`. Mirrors `providers/index.ts` |
| `prompt.ts` | `buildSystemPrompt()` — 3 tiers: stable (SOUL+tools+rules) / context (ARGO/AGENTS/CLAUDE.md) / volatile (goals+time+**recent goal memory**) |
| `context.ts` | `trimMessages()` (fallback) + `compressMessages()` — LLM summarization of the dropped middle, falls back to trim on error |
| `agent.ts` | `createConversation()` (persistent multi-turn) + `runAgent()` (one-shot wrapper over it) + `dispatchTool()` — the loop. Optional `summarize` dep selects compress vs trim |
| `session.ts` | Shared run setup for one-shot + interactive: `prepareRun`, `buildSummarizer`, `writeRunMemory`, `consoleCallbacks`, `approver`, **`maybeCurate`** (session-start, 7d-gated skill maintenance), **`reviewAfterTurn`** (post-turn self-improvement nudge). Neither cli.ts nor interactive.ts imports the other |
| `interactive.ts` | `renderBanner` (logo, model, goals, tool + skill inventory) + `runChat` (the REPL: one `createConversation`, history persists, `/help` `/exit` `/skills`) |
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

- **DDG html endpoint 403s from datacenter / flagged IPs.** The `duckduckgo` adapter and its parser are correct (unit-tested), but `html.duckduckgo.com` / `lite.duckduckgo.com` block scrapers by IP — verified 403 from this dev environment on every endpoint/header/verb combo. Not a code bug. For reliable search off a residential IP, use Searxng (self-host) or Brave/SerpAPI. `web-fetch` is unaffected (verified live: example.com + Wikipedia → clean Readability markdown).
