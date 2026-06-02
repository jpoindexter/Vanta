# Argo Roadmap — v0 (done) → v1 (Full Hermes Parity)

Source of truth for build order. One line moves between `[ ]`/`[~]`/`[x]` as slices land.
Vision + rationale live in `docs/prd.md`. Hermes component map: `docs/hermes-map.html`.
Runtime flow: `docs/argo-flow.md`. Locked choices: `DECISIONS.md`. Deferred: `PARKED.md`.

> This roadmap was rebuilt 2026-06-02 from a full read of the Hermes reference
> (`~/Documents/GitHub/_active/hermes-reference`, 4 recon passes: model gateways,
> self-improvement loop, skills library, interactive/autonomy layer). Where the
> map (`hermes-map.html`) marks a module "skip for v0", this roadmap **overrides**
> it — v1's goal is parity, so most "skip" verdicts are now "build".

---

## Where we are

**v0 = "has all the parts".** All 7 original PRD phases done — agent loop, skills+memory,
web search, browser+vision, code/dev, autonomy primitives, comms. Interactive banner+REPL.
32 tools · 290 tests green (16 Rust + 274 TS) · typecheck clean.

**v1 = "is a full personal agent".** v0 felt like scripts because the *experience and
self-improvement layer* is thin: no setup, no Gemini, no memory of past conversations,
nothing learns automatically, not reachable as a service. v1 closes that.

## TUI — real terminal UI (shipped 2026-06-02, modeled on Hermes ui-tui + Claude CLI)
- **Streaming engine**: `LLMProvider.stream()` (OpenAI family) yields token deltas; `agent.ts` emits them via `onTextDelta` (falls back to non-streaming `complete()` when unused — all prior paths unchanged). Pure `foldToolCallDeltas` assembles streamed tool calls.
- **Ink TUI** (`tui/app.tsx` + `tui/launch.tsx`): React/Ink 7 app — streaming transcript (live token-by-token), interleaved tool activity (`→`/`✓`/`✗`), spinner status line (model + state), input composer (`ink-text-input`), **inline approval prompts** for kernel `ask` risks, minimal slash (`/help /clear /model /exit`). `argo` launches it on a TTY; `--no-tui` / `ARGO_NO_TUI` / resume / non-TTY fall back to the readline REPL (which keeps the full slash set).
- Verified: pure reducer + `ink-testing-library` render smoke + module load under tsx. **Live streaming in a real terminal is the user's to confirm** (a TTY is needed; can't drive one from the build sandbox). New deps: `ink`, `react`, `ink-text-input` (+ dev `@types/react`, `ink-testing-library`).
- *Next for the TUI:* full slash parity in-TUI (refactor repl-commands to return lines), scrollback/virtual history, resume-in-TUI, wire the self-improvement review without console noise.

## Install & REPL (shipped 2026-06-02)
- **`./install.sh`** — Hermes/OpenClaw-style installer: builds kernel + deps, seeds `~/.argo/skills`, installs a global **`argo`** launcher into `~/.local/bin` (only edits a shell rc if that dir isn't already on PATH). Type `argo` from anywhere.
- **Full REPL slash commands** (`repl-commands.ts`): `/help /exit /clear /skills /tools /model /status /goals /sessions /resume <id> /cron` — was only `/help /exit /skills`.

## v1 done — one sentence

Open `argo` → it greets you and talks back → a first-run wizard configures any model
backend (ChatGPT / Claude / Gemini / local / OpenRouter) without editing files → it
remembers conversations across sessions → it learns from what it does (writes its own
skills, prunes them safely) → it's reachable as a background service you can text.

---

## Build order (execute top-down; each slice = real code + co-located tests + `tsc` clean + one commit)

### A — Hook to any model + full setup  ← ✅ SHIPPED 2026-06-02 (live-verified on Gemini)
- [x] **A1 · Gemini provider** (S) — Google's OpenAI-compatible endpoint via the OpenAI adapter (baseURL swap), `GEMINI_API_KEY`/`GOOGLE_API_KEY`. **Live-verified:** `ARGO_PROVIDER=gemini argo run` returns on `gemini-2.5-flash`.
- [~] **A2 · Provider registry** — **DEFERRED** (review call): two adapters cover 5 providers; the full ProviderProfile registry is premature (over-generalization). A small shared `providers/catalog.ts` was extracted instead. Build the registry at the 6th provider / 3rd wire format.
- [x] **A3 · OpenRouter provider** (S) — one key → 200+ models, OpenAI-compatible. `OPENROUTER_API_KEY`.
- [x] **A4 · `argo setup` wizard** (M) — provider picker → hidden key prompt → **merge** into `argo-ts/.env` (pure `upsertEnv`, preserves all other keys) → model w/ default → persist (0600). Unit + integration tested.
- [x] **A5 · First-run detection** (S) — no resolvable backend on launch → auto-run `argo setup`, **TTY-gated** (non-interactive callers told to run `argo setup`, never block). Wired `setup`/`status`/`doctor` commands.
- [x] **A6 · `argo status` / `argo doctor`** (S) — boxed health: kernel **ping only** (never spawn), provider+model, per-provider key **presence** (✓/✗, never the value), store + skill/memory/goal counts. Live-verified.

### B — Self-improvement loop  ← ✅ SHIPPED 2026-06-02 (live-verified on Gemini)
- [~] **B1 · Hook spine** — **DEFERRED** (same call as A2): the review is wired directly at the post-turn site in both callers; one consumer doesn't justify a generic 5-event bus. Build it at the 2nd consumer (Rule of 3).
- [x] **B2 · Post-turn nudge counters** (S) — pure `shouldReview(toolIterations, turnIndex, env)`: fires on a busy turn (≥`ARGO_REVIEW_MIN_TOOLS`, default 6) or periodically (every `ARGO_REVIEW_EVERY`, default 8). `toolIterations` added to `AgentOutcome`. `ARGO_SELF_IMPROVE=0` disables.
- [x] **B3 · Background-review fork** (M) — `review/background-review.ts`: post-turn, spawns a tool-restricted agent (`recall` + `write_skill` only), replays the transcript, review prompt biased to act with the do-NOT-capture list. Best-effort — never fails the main turn. Live-verified (judged "no skill" on a trivial turn; unit-tested write path).
- [x] **B4 · Skill provenance + safe curator** (M) — review-written skills tagged `argo-learned` (`LEARNED_TAG`); curator **never auto-deletes** (archives only `argo-learned` stale skills — reversible; reports stale hand-authored + long-archived instead of touching them); `maybeCurate()` wired at session start, 7d-interval-gated via `~/.argo/.curator_state.json`.
- [~] **B5 · Memory pre/post-turn** — **PARTIAL**: post-turn memory already written (`writeRunMemory`); pre-turn recall already injected (`recentMemory`→prompt). Remaining: move recall from the system prompt's volatile tier into the user message to preserve prefix-cache (optimization, deferred).

### C — Continuity  ← ✅ SHIPPED 2026-06-02 (live-verified resume on Gemini)
- [x] **C1 · Session persist + resume** (M) — **file-based** (`~/.argo/sessions/<id>.json`, id `YYYYMMDD-HHMMSS`), not SQLite — dependency-free + git-versionable, consistent with skills/memory (avoids Node's flagged experimental `node:sqlite`). `sessions/store.ts` (zod-validated round-trip), `createConversation(...,{history})` seeds prior turns + fresh system prompt, `argo sessions` lists newest-first, `argo resume <id>` / `argo --resume <id>` rehydrates. Saved after every turn. Bonus: fixed REPL Ctrl+D/EOF to exit cleanly instead of erroring.

### D — Borrow the skills library  ← ✅ SHIPPED 2026-06-02
- [x] **D1 · Port skills** (M) — 10 high-value Hermes/OpenClaw skills ported into bundled `argo-ts/skills-library/` (coupling stripped: `HERMES_HOME`→`ARGO_HOME`, `delegate_task`→delegate subagent, kanban/s6/TUI removed), with `argo skills install [--force]` → idempotent, non-destructive copy into `~/.argo/skills/` (`skills/library.ts`). Ported: systematic-debugging, test-driven-development, writing-plans, requesting-code-review, spike, humanizer, github-pr-workflow, claude-design, duckduckgo-search, gstack-openclaw-retro. Live-verified install (10/10). *Headroom:* ~171 more portable skills exist in the references — add more to `skills-library/` any time.
- [ ] **D2 · Skill bundles** (S) — adopt Hermes' YAML bundle schema (`name`/`description`/`skills:[]`/`instruction`) so one `/slash` loads several skills. *Why:* composite operator commands. (Pending — not blocking.)

### E — Autonomy & reach  ← daemon is the keystone (E1 shipped; E2–E6 pending)
- [x] **E1 · Daemon / service mode** (M/L) — ✅ SHIPPED 2026-06-02. `argo gateway` foreground daemon (`gateway/run.ts`: interruptible tick loop over `runDueTasks`, SIGINT/SIGTERM-clean, one bad task non-fatal). launchd service manager (`service/`: pure plist gen + `argo service install|uninstall|status`, captures PATH so launchd finds node/cargo). Cron no longer needs an external trigger. Verified: foreground daemon starts/ticks/stops; `service status` read-only. (`launchctl load` not auto-run — installing a persistent agent needs the user's OK.)
- [x] **E2 · Telegram gateway** (M) — ✅ SHIPPED 2026-06-02 (offline-tested; live needs a bot token). `PlatformAdapter` contract (`gateway/platforms/base.ts`) + `TelegramAdapter` (getUpdates long-poll + sendMessage, pure `parseUpdates`/`parseAllowlist`, chat-id allowlist). Wired into the gateway: each tick polls, runs inbound → agent turn → reply (`pollPlatform`, handler error becomes the reply). Auto-enabled by `ARGO_TELEGRAM_TOKEN`. **Live use needs a @BotFather token** (I can't provision one). *Limitation:* each message is a one-shot run (no per-chat session yet — future, key sessions by chatId). Other ~19 platforms deferred (Rule of 3).
- [x] **E3 · Webhook triggers + deliver targets** (M) — ✅ SHIPPED 2026-06-02 (HMAC + HTTP integration-tested). `gateway/webhook.ts`: constant-time `verifyGithubSignature` (sha256 HMAC, known-vector tested), `resolveDeliver` (`local`/`file:<path>`/`telegram:<chatId>`), `startWebhookServer` (POST-only, HMAC-gated, 200-fast + background agent run). Wired into the daemon (`ARGO_WEBHOOK_PORT`/`_SECRET`/`_PROMPT`/`_DELIVER`); inbound event → agent turn → deliver. Verified via real localhost requests (200 signed / 401 unsigned / 405 non-POST).
- [~] **E4 · Interrupt** (S) — ✅ SHIPPED 2026-06-02 (unit-tested). `AbortSignal` in `AgentDeps`, checked between loop iterations → `stoppedReason: "interrupted"` (post-run memory still runs). Ctrl+C aborts a one-shot `argo run` gracefully instead of hard-killing. **Steer (mid-turn message injection) deferred** — needs non-blocking stdin during a turn (a REPL redesign); low value in the current synchronous loop.
- [x] **E5 · MCP client** (M) — ✅ SHIPPED 2026-06-02 (protocol unit-tested; live needs a real MCP server). Dependency-free stdio JSON-RPC client (`mcp/client.ts`, injectable transport — initialize/tools-list/tools-call, concurrent-request correlation, error→reject) + `mcp/mount.ts` (config from `ARGO_MCP_SERVERS` or `~/.argo/mcp.json`, spawns each server best-effort, registers discovered tools as Argo tools through the **same kernel `assess()`**). Mounted in `prepareRun` (no-op without config). StreamableHTTP transport + per-chat reuse = future; direct Google integrations kept as-is.
- [ ] **E6 · ACP server wrapper** (L, optional) — implement ACP `Agent` methods over Argo's session + delegate primitives so editors (Zed/Claude-Code-style) can drive Argo. *Why:* networked cross-agent without inventing a protocol. Lowest priority.

### F — Robustness steals (cheap, fold in opportunistically)
- [x] **F1 · Message sanitization** (S) — `sanitizeMessages` (context.ts), run pre-flight before every model call: drops orphaned tool_results + strips lone Unicode surrogates (keeps valid emoji pairs). *Prevents silent 400s.*
- [x] **F2 · Loop guardrails** — ✅ SHIPPED 2026-06-02. Stops on 3 consecutive empty results (`MAX_CONSECUTIVE_FAILURES`) AND on the same tool+args called 3× in a turn (`MAX_IDENTICAL_CALLS` — stuck-in-a-rut detection). Unit-tested.
- [ ] **F3 · Subdirectory hints** (S) — inject cwd hint after file/shell tool results.
- [~] **F4 · Retry w/ jittered backoff** — the `openai` SDK already retries with backoff (maxRetries default 2); explicit per-model tracking deferred unless we hit limits.

### G — Subscription auth  ← G1 + G2(Codex) SHIPPED (grey area, user-run)
- [x] **G1 · Claude subscription (`claude-code` provider)** — ✅ SHIPPED 2026-06-02 (unit-tested; **user live-verifies** — the harness blocks the assistant from running it as credential-repurposing). `ARGO_PROVIDER=claude-code` uses your Claude Pro/Max OAuth token (from `~/.claude/.credentials.json` or `CLAUDE_CODE_OAUTH_TOKEN`). The earlier "not viable" was WRONG — it works with the full Claude-Code header set + system-prompt spoof (see DECISIONS reversal). **Grey area** under Anthropic ToS; the wizard labels it as such. API keys remain the clean path.
- [x] **G2 · ChatGPT-Codex OAuth** — ✅ SHIPPED 2026-06-02 (unit-tested + **live-verified** end-to-end with real `~/.codex/auth.json`; user-run, same grey-area as G1). `ARGO_PROVIDER=codex` uses your ChatGPT subscription via the Codex CLI's OAuth session — Responses API at `chatgpt.com/backend-api/codex`, refresh + write-back to the shared `~/.codex/auth.json`. The earlier "deferred, same gating as Claude" was WRONG: the Codex backend accepts subscription tokens (see DECISIONS reversal). `providers/codex.ts` + `codex-auth.ts`. **Gemini-CLI OAuth still deferred** — API keys cover Gemini; revisit only if asked.

---

## Sequencing logic

1. **A first** — it's the literal end-state ("open → setup → hook to ChatGPT/Gemini → run") and unblocks daily use.
2. **B + C next** — self-improvement and memory-of-conversations are what make it *feel* like an agent rather than a CLI; B is the "self-improves everything" ask.
3. **D** any time — pure content, no code risk; high capability-per-effort.
4. **E last** — daemon (E1) is the keystone; gateways/webhooks/steer hang off it. Bigger, lower daily value until A–D land.
5. **F** folded in opportunistically; **G** enhances A when API-key parity is proven.

## What stays out of v1 (→ PARKED)
Bedrock + the long tail of ~20 niche providers; the other ~19 messaging platforms beyond Telegram; image-gen / transcription providers; multi-credential failover pool; trajectory/datagen pipeline (training-data, not runtime); desktop (Tauri) app.

---

## v1.1 — Hermes parity (post-recon 2026-06-02)
Founding mandate (from the genesis session): **"the next agent, better than Hermes."** Match Hermes' breadth, exceed on kernel safety. Reference = Jason's CUSTOMIZED install `~/.hermes/hermes-agent/` (not the public repo). Sequenced slices — ship ONE at a time, each with a one-sentence Done.

- [ ] **P1 · Slash-command parity** (SHIP FIRST). Add the session commands Hermes has that Argo lacks: `/history` (show transcript), `/retry` (re-run last user turn), `/undo` (drop last turn[s]), `/title <name>` (name session), `/reset` (full reset incl. system), `/fork` (branch session → new id, copy history), `/redraw` (TUI repaint). Wire in BOTH readline (`repl-commands.ts`) + TUI (`SLASH_COMMANDS`/palette). **Done = each command backed by real convo/session logic with a test; visible in both UIs.**
- [ ] **P2 · Memory parity = DIFF, not build.** Argo already shipped a memory store (`~/.argo`, injection, LLM compression). Compare against Hermes' memory (`~/.hermes/memories`, state.db) and close only the real deltas. Don't rebuild.
- [ ] **P3 · Self-improvement parity = DIFF.** Argo shipped track B (background-review, `write_skill`, safe curator). Diff vs Hermes' self-improvement loop; close deltas only.
- [ ] **P4 · Identity reframe** (LOW RISK — prompt wording only). `prompt.ts`: reframe from repo-confined coding tool → personal operator across life domains (email/calendar/home/media/research) that KEEPS goal-gating + verified-output + kernel approval. Safety is enforced in code (`resolveInScope` + kernel `assess`), independent of prompt wording — confirmed 2026-06-02. FS work stays root-scoped; non-FS tools gated by approval. Blend = Jason's "both 1 and 2".
- [ ] **P5 · Capability breadth (banner + tools).** Reflect the real tool/skill surface in the startup banner (Hermes shows domains: media/research/smart-home/productivity/social). Add genuinely-missing high-value tools only.
- [~] **P6 · Skills — PARKED.** Hermes has 192 but Jason: "random ass skills that make no sense." Do NOT bulk-port. Curate a small high-value set later, demand-driven. Lowest priority.

**Custom-Hermes fixes worth studying (diff `hermes-agent` vs `hermes-agent-clean`):** `gateway/stream_dispatch.py`+`stream_events.py` (streaming), `gateway/platforms/*`, `cron/scheduler.py`, `hermes_cli/config.py`+`web_server.py`, `plugins/model-providers/ai-gateway`.
