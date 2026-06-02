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
- [ ] **E3 · Webhook triggers + deliver targets** (M) — HMAC-validated webhook route + a `--deliver <target>` resolver shared by cron and webhooks. *Why:* completes autonomy (GitHub/API triggers; results land in Telegram/file).
- [ ] **E4 · Steer + interrupt** (M) — `steer(text)` drained onto the last tool result; per-iteration interrupt flag checked in the API loop; `/steer` `/queue` `/stop` + Ctrl+C. *Why:* mid-turn correction without restarting.
- [x] **E5 · MCP client** (M) — ✅ SHIPPED 2026-06-02 (protocol unit-tested; live needs a real MCP server). Dependency-free stdio JSON-RPC client (`mcp/client.ts`, injectable transport — initialize/tools-list/tools-call, concurrent-request correlation, error→reject) + `mcp/mount.ts` (config from `ARGO_MCP_SERVERS` or `~/.argo/mcp.json`, spawns each server best-effort, registers discovered tools as Argo tools through the **same kernel `assess()`**). Mounted in `prepareRun` (no-op without config). StreamableHTTP transport + per-chat reuse = future; direct Google integrations kept as-is.
- [ ] **E6 · ACP server wrapper** (L, optional) — implement ACP `Agent` methods over Argo's session + delegate primitives so editors (Zed/Claude-Code-style) can drive Argo. *Why:* networked cross-agent without inventing a protocol. Lowest priority.

### F — Robustness steals (cheap, fold in opportunistically)
- [x] **F1 · Message sanitization** (S) — `sanitizeMessages` (context.ts), run pre-flight before every model call: drops orphaned tool_results + strips lone Unicode surrogates (keeps valid emoji pairs). *Prevents silent 400s.*
- [~] **F2 · Loop guardrails** — PARTIAL: the loop already stops on 3 consecutive empty tool results (`MAX_CONSECUTIVE_FAILURES`). Same-tool+args-repeat detection still pending.
- [ ] **F3 · Subdirectory hints** (S) — inject cwd hint after file/shell tool results.
- [~] **F4 · Retry w/ jittered backoff** — the `openai` SDK already retries with backoff (maxRetries default 2); explicit per-model tracking deferred unless we hit limits.

### G — Subscription auth (enhancement to A; API keys work without it)
- [ ] **G1 · Claude subscription OAuth** (M) — port Hermes' PKCE flow (claude.ai/oauth/authorize, paste `code#state`, exchange + refresh), store `~/.argo/.anthropic_oauth.json`, auto-refresh. *Why:* the "Claude subscription not API key" ask (14 Hermes reactions).
- [ ] **G2 · ChatGPT (Codex) + Gemini-CLI OAuth** (M) — device-code / PKCE subscription login. *Why:* "hook to ChatGPT/Gemini" via subscription, not just API key. Lower priority — API keys already cover both.

---

## Sequencing logic

1. **A first** — it's the literal end-state ("open → setup → hook to ChatGPT/Gemini → run") and unblocks daily use.
2. **B + C next** — self-improvement and memory-of-conversations are what make it *feel* like an agent rather than a CLI; B is the "self-improves everything" ask.
3. **D** any time — pure content, no code risk; high capability-per-effort.
4. **E last** — daemon (E1) is the keystone; gateways/webhooks/steer hang off it. Bigger, lower daily value until A–D land.
5. **F** folded in opportunistically; **G** enhances A when API-key parity is proven.

## What stays out of v1 (→ PARKED)
Bedrock + the long tail of ~20 niche providers; the other ~19 messaging platforms beyond Telegram; image-gen / transcription providers; multi-credential failover pool; trajectory/datagen pipeline (training-data, not runtime); desktop (Tauri) app.
