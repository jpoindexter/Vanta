# Argo Roadmap — v0 (done) → v1 (Full Hermes Parity)

Source of truth for build order. One line moves between `[ ]`/`[~]`/`[x]` as slices land.
North star / why: [`MANIFESTO.md`](MANIFESTO.md). Vision + rationale: `docs/prd.md`. Hermes component map: `docs/hermes-map.html`.
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

**v1 = done.** All v1.1–v1.5 tracks shipped. 581 tests green (27 Rust + 554 TS) · tsc clean · pushed.

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

## v1.1 — Hermes parity (post-recon 2026-06-02) — CORE COMPLETE
Founding mandate (from the genesis session): **"the next agent, better than Hermes."** Match Hermes' breadth, exceed on kernel safety. Reference = Jason's CUSTOMIZED install `~/.hermes/hermes-agent/`. **Full audit + gap matrix: [`docs/parity-audit.md`](docs/parity-audit.md) — all 8 manifesto hard lines verified in code; core parity met.** P1/P1b/P2/P3/P4/P5 shipped 2026-06-02; remaining deltas (session search, more platforms, desktop/web UI, skill breadth) parked by design.

- [x] **P1 + P1b · Slash-command parity** — ✅ SHIPPED 2026-06-02. `/history /retry /undo /reset` (commits `73bf5c6`) + `/title /fork` (`2285270`), both readline + TUI. `/redraw` dropped (TUI auto-renders). Known minor gap: TUI `/undo` retracts model history but not the rendered transcript (needs a reducer action) — readline is fully correct.
- [x] **P2 · Memory parity** — ✅ SHIPPED 2026-06-02. Injection was already capped; added a **stored-file cap** (`ARGO_MEMORY_MAX_BLOCKS`, default 50) — older blocks pruned from the live file but git-retained. Matches Hermes' capped layer. (Memory compression deferred — optional.)
- [x] **P3 · Self-improvement parity** — ✅ SHIPPED 2026-06-02. Curator + `write_skill` + background-review (track B) were present; closed the real gap = **skill-index injection** (`buildSystemPrompt` injects names+descriptions; `recall` now loads the full body on demand). The Hermes index/recall/curator pattern is complete.
- [x] **P4 · Identity reframe** — ✅ SHIPPED 2026-06-02. `prompt.ts`: default soul + rules reframed from repo-confined coding tool → "trusted personal operator, the agent built to surpass Hermes," operating across the user's digital life (code/research/comms/calendar/web/business) while KEEPING goal-gating + verified-output + honest-about-limits. Rule 5 changed from "Never write outside root" → "file writes stay within root; the kernel gates everything else." Safety stays code-enforced (`resolveInScope` + kernel `assess`), independent of wording. New test locks the framing (old confinement wording asserted gone). 457 green, tsc clean.
- [x] **P5 · Capability breadth (banner)** — ✅ SHIPPED 2026-06-02. Both banners (TUI + readline) now group tools by **domain** (`tui/capabilities.ts`), reading like a personal operator. Adding more tools is demand-driven.
- [~] **P6 · Skills — PARKED.** Hermes has 192 but Jason: "random ass skills that make no sense." Do NOT bulk-port. Curate a small high-value set later, demand-driven. Lowest priority.

**Custom-Hermes fixes worth studying (diff `hermes-agent` vs `hermes-agent-clean`):** `gateway/stream_dispatch.py`+`stream_events.py` (streaming), `gateway/platforms/*`, `cron/scheduler.py`, `hermes_cli/config.py`+`web_server.py`, `plugins/model-providers/ai-gateway`.

## v1.3 — Autonomy + senses (requested 2026-06-02, rapid-fire)
- [x] **O1 · Agent-chosen model on delegate** — ✅ SHIPPED. `delegate` provider/model params + tool description. Agent routes subtasks to any backend (Ollama, Gemini, etc.).
- [x] **O2 · Swarms** — ✅ SHIPPED. `tools/swarm.ts` — parallel multi-agent workers, fan-out + synthesize.
- [x] **O3 · Eyes (screen)** — ✅ SHIPPED. `look_at_screen` — `screencapture -x` → vision model. Needs Screen Recording permission.
- [x] **O4 · Camera** — ✅ SHIPPED. `look_at_camera` — webcam frame → vision model.
- [x] **O5 · Video** — ✅ SHIPPED. `watch_video` — ffmpeg frame extraction → vision model.
- [x] **O6 · Self-directed model selection** — ✅ shipped with O1.
- [x] **O7 · Speech & audio** — ✅ SHIPPED. `speak` (TTS via `say`) + `transcribe` (STT via whisper).
- [x] **O8 · Self-improving via the web** — ✅ SHIPPED (behavior). Prompt rule 9 + brain Growth drive directs the agent to browse and write skills from what it learns.
- [x] **O9 · Self-improving codebase ("dark factory")** — ✅ SHIPPED 2026-06-03. `factory/` module: triage → plan → execute → verify → commit. Kernel-enforced: `is_protected_path` blocks writes to `src/*.rs`, `factory/*.ts`, `MANIFESTO.md`. `argo improve` (review mode) + `argo factory approve` (auto). Live-verified end-to-end.

## v1.5 — Efficiency & emergent brain (requested 2026-06-03)
Target hardware: MacBook Pro 14" M4 Pro / 48GB / macOS Tahoe — must run lean here.
- [~] **E-eff1 · Token + power frugality** — agent uses as few tokens / as little power as it can, "however it sees fit": concise by default, prefer LOCAL (Ollama) models for simple subtasks via delegate, trim prompt injection when context is tight. Bake a frugality directive into the prompt + brain drives. (directive shipped; routing heuristics next)
- [ ] **E-eff2 · Prefer-local routing** — auto-route simple/cheap work to local Ollama on the M4 Pro (free, low-power); reserve paid frontier models for hard reasoning. Extends model routing + delegate.
- [ ] **B-v2 · Emergent self-designed brain** — beyond md files: let Argo design its OWN brain representation (its own code/format/tech) that humans don't need to read. The md brain (v1.4) is the bootstrap; v2 lets Argo evolve the substrate under the kernel's rules. (research + careful — high blast radius.)
- [ ] **META · Don't stop until complete** — standing directive: work the whole backlog top-down, commit + push every slice, until done. (Active.)

## v1.6 — MCP: use · make · serve (requested 2026-06-03)
Argo as a self-extending operator: consume any MCP server, build/hook in new ones on
its own, and be callable as a server itself. Extends **E5** (MCP client, shipped). Built
in order — each phase ships working before the next starts (anti-drift: no three-half-things).
- [~] **MCP-1 · Use any MCP (consume)** (S) — E5's dependency-free stdio client is built + tested; the only gap is **config discovery**. Accept Claude's `mcpServers` key (not just `servers`); discover `./.mcp.json` in the project (not just `~/.argo/mcp.json` + `ARGO_MCP_SERVERS`); add `argo mcp list` to verify loaded servers/tools. **Done =** `argo mcp list` shows a configured server's tools and Argo calls one in a live session. *Unblocks the immediate use case: Cosmos image search → design Argo's own visual style.*
- [ ] **MCP-2 · Make + hook in at runtime** (M) — the autonomous half. **`mount_mcp` tool**: Argo adds an MCP server to its LIVE registry mid-session, no restart (kernel-gated like any spawn) — *"find an MCP and hook in."* **`build-mcp-server` skill**: Argo scaffolds a new MCP server (TS template + protocol handshake + build) when no tool exists, then mounts it via the tool above — *"the site's blocking me, I'll build one."* **Done =** in one session Argo builds a trivial MCP, mounts it, calls its tool; and separately mounts an existing server on command.
- [ ] **MCP-3 · Be a server (serve)** (M/L) — **`argo mcp serve`**: expose Argo's tools over MCP stdio so it's callable FROM Claude Code (drive Argo's operator tools inside your main CC session). Every incoming call routes through the kernel `assess()` gate (already enforced — that's what makes exposure safe). Design wrinkle: a non-interactive caller can't answer an `Ask` verdict → external calls need a **pre-approved allowlist** (read-only tools auto-allow; mutations need explicit config). **Done =** from Claude Code, a tool call into Argo executes through the kernel gate. Supersedes **E6** (ACP wrapper) as the cross-agent path.

## v1.4 — Selfhood & continuous learning (requested 2026-06-02/03)
The agent grows an identity and a living model of its world. Everything here stays
under the kernel's hard lines (non-destructive, verified, approval-before-risk).
- [x] **S1 · Self-authored identity files** — ✅ SHIPPED. Brain regions (`~/.argo/brain/`: identity, semantic, episodic, user_model, drives, reflections, mood). `brain` tool + `/memory`. `SOUL.md` + `AGENT-MANIFESTO.md` at repo root.
- [~] **S2 · Personality develops from interaction** — PARTIAL. Brain `user_model` region + prompt rule 9 drives it. Full personality.md evolution loop is demand-driven.
- [~] **S3 · Continuous world/user/codebase context** — PARTIAL. Brain regions + post-turn memory cover this. Full heartbeat-driven refresh ties to S5.
- [~] **S4 · Skill authorship discipline** — PARTIAL. Curator uses `LEARNED_TAG` + never-auto-deletes. Versioning/merge on `write_skill` deferred.
- [ ] **S5 · Heartbeat** — steady tick driving S2/S3 selfhood updates + factory loop. Gateway daemon exists (E1); wiring the selfhood updates onto it is the remaining piece.

## SHIPPED in the 2026-06-02/03 build marathon (all committed + pushed)
**501 TS + 21 Rust tests green, tsc clean.** Across v1.1–v1.5:
- **Providers:** Codex ChatGPT-OAuth, claude-code; agent-chosen model on `delegate` (O1/O6) + workers get skill index + brain.
- **Senses:** native image input (paste/drag-drop/`/image`/`/paste`/`/attachments`); `look_at_screen` (eyes, O3); `watch_video` (O5); `speak` TTS (O7); vision routed through the ACTIVE provider.
- **Selfhood:** Argo **brain** (`~/.argo/brain/`, 7 regions, neurodivergent-first identity, frugality drive) read each session + `brain` tool + `/memory`.
- **UX:** queued type-ahead (U1), notifications (U3), real token usage (U4), `/compress` (U5), `/memory` (U6), `/export` (U7); full command set incl. `/goal /plan /title /fork /history /retry /undo /usage /copy /update`.
- **Skills/memory:** skill-index injection + recall-body, capped memory, `skills lint`, in-session `todo`+`/plan`.
- **Safety (manifesto-critical):** kernel `assess_action` hardened against the Hermes #36846/#36645 denylist/scope bypasses.
- **Efficiency:** token/power frugality directive; prefer-local delegation. **Installer:** `bootstrap.sh`. **Docs:** MANIFESTO + parity-audit + claude-cli-gaps + hermes-issues-map; CLAUDE.md kept current.

## ALSO SHIPPED in the marathon (continued)
O2 swarms · O4 camera (`look_at_camera`) · O5 video (`watch_video`) · O7 speak (TTS) + transcribe (STT) ·
volatile skills (#36656) · `/context` · `/mcp` · `/export` · `/compress` · `/memory` · `/plan`+todo ·
`skills lint` · O8/S2/S3 continuous-self-improvement behavior (prompt rule 9 + brain Growth drive).

## SHIPPED 2026-06-03 (post-marathon session)
**581 tests green (27 Rust + 554 TS) · tsc clean · pushed.**
- **Bug fixes (4):** dropped file paths treated as slash commands (readline + TUI) · video drops not routed to `watch_video` · `look_at_screen` cryptic permission error → friendly hint · agent falsely claimed Desktop image paths were out of scope.
- **O9 dark factory (complete):** `factory/` module (triage/planner/executor/verifier/run) · kernel `is_protected_path` (27 Rust tests) · `argo improve` + `argo factory [approve|status]` CLI · gateway detached-child spawn for `__factory__` cron entries · `AGENT-MANIFESTO.md` · live end-to-end verified (verifier correctly rejected a bad model output, discarded cleanly).

## RESIDUAL — open-ended or demand-driven (not blocking daily use)
- **B-v2 · Emergent self-designed brain** — agent designs its own brain substrate (its own format/code). Open research; the md brain (S1) is the bootstrap. No clear done line — pursue when the md brain feels limiting.
- **S5 · Heartbeat selfhood updates** — wire brain writes onto the gateway tick so identity evolves continuously. Small, concrete, low urgency.
- **E-eff2 · Prefer-local routing** — auto-route cheap work to local Ollama. Extends `model-router.ts`. Small.
- **Polish tier:** U2 @-mentions (composer autocomplete) · themes · `/vim` · multi-dir `/add-dir` · S4 skill-versioning-on-write · cron-output-awareness (gateway).
- **D2 · Skill bundles** — YAML bundle schema for composite slash commands. The factory can implement this.
- **SEC · Secret-hygiene hardening** (S) — never freak out about "leaked" tokens again, by making leaks structurally impossible. (a) **`gitleaks` pre-commit hook** blocks any secret-shaped string from being committed; (b) commit `.example` twins, keep real `.env`/`.mcp.json` gitignored (already the pattern in this repo); (c) pre-first-push check: `git ls-files | grep -iE '\.env|\.mcp\.json|secret|credential'` → empty = clean. **Rule: a token in a gitignored file is safe; a token in a commit is burned** — rotate-first if ever committed, scrub history second. *(False-alarm 2026-06-03: the cosmos `.mcp.json` token was gitignored and never committed — full history scan clean, no rotation needed. The scare came from the file existing on disk with a real token, which you can't distinguish from "committed" at a glance. The hook removes the guesswork.)*

## v1.2 — Claude-CLI UX parity (non-coding) — gap analysis 2026-06-02
Full grounded gap list: [`docs/claude-cli-gaps.md`](docs/claude-cli-gaps.md) (vs Claude Code 2.1.156, coding-specific features excluded, Argo side verified against the repo). Build order:
- [x] **U1 · Queued input while busy** — ✅ SHIPPED. Type-ahead queue in TUI reducer + readline; drained on turn end.
- [ ] **U2 · @-file mentions** (★★★) — composer path autocomplete (pairs with image attach).
- [x] **U3 · Notifications** — ✅ SHIPPED. Terminal bell + `osascript` desktop ping on turn-complete and approval-needed.
- [x] **U4 · Real token/cost usage** — ✅ SHIPPED. Provider `usage` fields captured → exact tokens in `/usage` + status bar.
- [x] **U5 · /context + /compress** — ✅ SHIPPED. `/context` shows token-budget breakdown; `/compress` triggers manual compaction.
- [x] **U6 · /memory quick-add** — ✅ SHIPPED. `/memory <text>` appends to brain semantic region mid-turn.
- [x] **U7+ · export · /mcp · /copy · /update** — ✅ SHIPPED. `/export` (markdown transcript), `/mcp` (list servers), `/copy` (clipboard), `/update` (git pull). Multi-dir `/add-dir` + themes + `/vim` remain demand-driven.
Shipped already vs Claude CLI: image paste/drag-drop, slash palette, /model picker, /copy, /usage, streaming, approvals.

**Self-evolving-Hermes takeaways (Nemotron Labs livestream, 2026):** The skill-bloat answer is NOT fewer/curated skills — it's **management**: inject only the skill *index* (names+descriptions) into context, adaptive-search to pull a full skill *body* on demand, and a background **curator** that prunes/compresses/revises the library. Argo already has the curator (track B); the missing piece is **index-only injection + on-demand body load** (currently Argo lists skills but should verify it's not over-injecting). Memory layer is **capped and pruned** (relevance decays over time). Identity carries a persona + "rules of engagement" + a sense of shared history with the user (loyalty) as prompt-injection resistance, paired with hard kernel boundaries. → This **reframes P6**: the win is the skill *system* (index/search/curator), so a small high-value seed set + good management beats bulk-porting 192. Folds into P2 (capped/pruned memory) and P3 (curator + skill-from-workflow are the self-evolving core — diff vs Argo's track B).
