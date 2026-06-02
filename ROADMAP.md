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

### B — Self-improvement loop  ← "how it self-improves everything"
- [ ] **B1 · Hook spine** (S) — minimal event bus: `onSessionStart`, `preLlmCall`, `preToolCall`, `postTurn`, `onSessionEnd`. *Why:* every self-improvement action in Hermes hangs off `invoke_hook`; without it there's nowhere to attach the loop. (Don't build all 17 Hermes hooks — these 5 cover it.)
- [ ] **B2 · Post-turn nudge counters** (S) — `turnsSinceMemory` (turn-based) + `itersSinceSkill` (iteration-based), both default 10 → set review flags. *Why:* nothing triggers learning today; this is the dual trigger Hermes uses.
- [ ] **B3 · Background-review fork** (M) — post-turn, spawn a second agent whitelisted to `[memory, skills]`, replay the turn snapshot, run a review prompt biased toward acting, write via `write-skill.ts`/`memory/store.ts`. Encode the do-NOT-capture list (env failures, negative tool claims, one-off narratives). *Why:* this is the actual learning act — turning a completed task into a reusable skill. Argo has the store + write tool but no reviewer driving them.
- [ ] **B4 · Skill provenance + safe curator** (M) — mark only review-fork-written skills as agent-created; **change curator `remove`→`archive`** (recoverable `~/.argo/skills/.archive/`, never auto-delete — Rule Zero); wire `curate()` at session-start, interval-gated (7d + idle, persisted `.curator_state`, first-run deferred). *Why:* an unwired curator never runs; provenance stops it eating hand-written skills; auto-delete is irreversible data loss the reference design forbids.
- [ ] **B5 · Memory pre/post-turn** (S) — prefetch recall into the **user message** pre-turn, sync post-turn; keep recall out of the system prompt (preserves prefix cache). *Why:* Argo's memory is per-goal summaries with no turn-level prefetch/sync.

### C — Continuity
- [ ] **C1 · Session persist + resume** (M) — SQLite `sessions`+`messages` (id = `YYYYMMDD_HHMMSS_rand`), `argo --resume <id>`, `argo sessions list|browse` picker, rehydrate into the message list. *Why:* Argo forgets everything between runs — the single biggest "feels like an agent" gap. Mirrors `hermes_state.py`.

### D — Borrow the skills library
- [ ] **D1 · Port top-20 skills** (M) — copy the highest-value Hermes/OpenClaw `SKILL.md`s into a bundled `argo-ts/skills-library/` shipped with Argo + an install path into `~/.argo/skills/`, stripping Hermes-internal coupling (`HERMES_HOME`, `delegate_task`, kanban, s6, TUI). Start: systematic-debugging, test-driven-development, writing-plans, requesting-code-review, claude-design, humanizer, github-pr-workflow, gstack-openclaw-retro (→ weekly-review), duckduckgo-search, spike. *Why:* "all the skills we can borrow" — instant capability, no code.
- [ ] **D2 · Skill bundles** (S) — adopt Hermes' YAML bundle schema (`name`/`description`/`skills:[]`/`instruction`) so one `/slash` loads several skills. *Why:* composite operator commands; bundle wins over same-named skill.

### E — Autonomy & reach  ← larger, later (daemon is the keystone)
- [ ] **E1 · Daemon / service mode** (M/L) — `ServiceManager` w/ launchd (macOS) + foreground `argo gateway`; move cron from OS-trigger to an in-process 5s `tick()`. *Why:* cron only fires when something long-lived runs; unlocks everything below.
- [ ] **E2 · Telegram gateway** (M) — `BaseAdapter` trio (`connect`/`disconnect`/`send`) + `PlatformRegistry`, **Telegram only** (Rule of 3 — defer the other ~19). Inbound message → agent turn → reply, through the daemon. *Why:* turns Argo into an always-available agent you text; one platform proves the pattern.
- [ ] **E3 · Webhook triggers + deliver targets** (M) — HMAC-validated webhook route + a `--deliver <target>` resolver shared by cron and webhooks. *Why:* completes autonomy (GitHub/API triggers; results land in Telegram/file).
- [ ] **E4 · Steer + interrupt** (M) — `steer(text)` drained onto the last tool result; per-iteration interrupt flag checked in the API loop; `/steer` `/queue` `/stop` + Ctrl+C. *Why:* mid-turn correction without restarting.
- [ ] **E5 · MCP client** (M) — read `mcp_servers` config, stdio + StreamableHTTP transports, register discovered tools into the registry. *Why:* a general tool gateway instead of owning each integration. (Decide vs keeping direct Google integrations — see DECISIONS.)
- [ ] **E6 · ACP server wrapper** (L, optional) — implement ACP `Agent` methods over Argo's session + delegate primitives so editors (Zed/Claude-Code-style) can drive Argo. *Why:* networked cross-agent without inventing a protocol. Lowest priority.

### F — Robustness steals (cheap, fold in opportunistically)
- [ ] **F1 · Message sanitization** (S) — strip Unicode surrogates / orphaned tool_results before each API call. *Why:* prevents silent 400s. ~20 lines.
- [ ] **F2 · Loop guardrails** (S) — stop on same tool+args failing N times / idempotent tool returning identical result N times. *Why:* runaway-loop safety, distinct from kernel content-safety.
- [ ] **F3 · Subdirectory hints** (S) — inject cwd hint after file/shell tool results. *Why:* prevents path confusion in deep trees.
- [ ] **F4 · Retry w/ jittered backoff** (S) — in the OpenAI adapter (5s base, 60s cap, interrupt-aware). *Why:* survive transient API/rate errors.

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
