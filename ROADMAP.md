# Vanta Roadmap — v0 (done) → v1

Source of truth for build order. One line moves between `[ ]`/`[~]`/`[x]` as slices land.
North star / why: [`MANIFESTO.md`](MANIFESTO.md). Vision + rationale: `docs/prd.md`.
Runtime flow: `docs/vanta-flow.md`. Locked choices: `DECISIONS.md`. Deferred: `PARKED.md`.

---

## Where we are

**v0 = "has all the parts".** All 7 original PRD phases done — agent loop, skills+memory,
web search, browser+vision, code/dev, autonomy primitives, comms. Interactive banner+REPL.
32 tools · 290 tests green (16 Rust + 274 TS) · typecheck clean.

**v1 = done.** All v1.1–v1.5 tracks shipped. 1243 tests green (27 Rust + 1216 TS) · tsc clean · pushed.

**v1 = "is a full personal agent".** v0 felt like scripts because the *experience and
self-improvement layer* is thin: no setup, no Gemini, no memory of past conversations,
nothing learns automatically, not reachable as a service. v1 closes that.

### Evolution ladder (2026-06-08 — full brief in `docs/evolution-brief.md`)

The bottleneck is no longer raw capability. It is coherence — Vanta knowing what it is
doing, what is blocked, and what closes loops before opening new ones.

| Level | Name | Status |
|-------|------|--------|
| 1 | **Tool user** — reads, writes, runs, searches, gates through kernel | ✅ shipped |
| 2 | **Trusted operator** — knows goal before tool use, verifies output, labels uncertainty, durable brain | ✅ shipped |
| 3 | **Loop closer** — persistent task stack, context-switch detection, bias toward closure, "where do we stand?" | ✅ shipped |
| 4 | **Command infrastructure** — ambient awareness, life-wide search, proactive triage, world model | 🔜 horizon |

Level 3 shipped with EF-TASKSTACK, MEM-RELEVANCE, OPERATOR-DASHBOARD, AUTO-ROUTER, VISION-COMPARE.
Level 4 target state maps to `COMMAND-CENTER`, `WORLD-MODEL`, `LIFE-SEARCH`, `AMBIENT` in the horizon bucket.

## TUI — real terminal UI (shipped 2026-06-02)
- **Streaming engine**: `LLMProvider.stream()` (OpenAI family) yields token deltas; `agent.ts` emits them via `onTextDelta` (falls back to non-streaming `complete()` when unused — all prior paths unchanged). Pure `foldToolCallDeltas` assembles streamed tool calls.
- **Ink TUI** (`tui/app.tsx` + `tui/launch.tsx`): React/Ink 7 app — streaming transcript (live token-by-token), interleaved tool activity (`→`/`✓`/`✗`), spinner status line (model + state), input composer (`ink-text-input`), **inline approval prompts** for kernel `ask` risks, minimal slash (`/help /clear /model /exit`). `vanta` launches it on a TTY; `--no-tui` / `VANTA_NO_TUI` / resume / non-TTY fall back to the readline REPL (which keeps the full slash set).
- Verified: pure reducer + `ink-testing-library` render smoke + module load under tsx. **Live streaming in a real terminal is the user's to confirm** (a TTY is needed; can't drive one from the build sandbox). New deps: `ink`, `react`, `ink-text-input` (+ dev `@types/react`, `ink-testing-library`).
- *Next for the TUI:* full slash parity in-TUI (refactor repl-commands to return lines), scrollback/virtual history, resume-in-TUI, wire the self-improvement review without console noise.

## Install & REPL (shipped 2026-06-02)
- **`./install.sh`** — builds kernel + deps, seeds `~/.vanta/skills`, installs a global **`vanta`** launcher into `~/.local/bin` (only edits a shell rc if that dir isn't already on PATH). Type `vanta` from anywhere.
- **Full REPL slash commands** (`repl-commands.ts`): `/help /exit /clear /skills /tools /model /status /goals /sessions /resume <id> /cron` — was only `/help /exit /skills`.

## v1 done — one sentence

Open `vanta` → it greets you and talks back → a first-run wizard configures any model
backend (ChatGPT / Claude / Gemini / local / OpenRouter) without editing files → it
remembers conversations across sessions → it learns from what it does (writes its own
skills, prunes them safely) → it's reachable as a background service you can text.

---

## Build order (execute top-down; each slice = real code + co-located tests + `tsc` clean + one commit)

### A — Hook to any model + full setup  ← ✅ SHIPPED 2026-06-02 (live-verified on Gemini)
- [x] **A1 · Gemini provider** (S) — Google's OpenAI-compatible endpoint via the OpenAI adapter (baseURL swap), `GEMINI_API_KEY`/`GOOGLE_API_KEY`. **Live-verified:** `VANTA_PROVIDER=gemini vanta run` returns on `gemini-2.5-flash`.
- [~] **A2 · Provider registry** — **DEFERRED** (review call): two adapters cover 5 providers; the full ProviderProfile registry is premature (over-generalization). A small shared `providers/catalog.ts` was extracted instead. Build the registry at the 6th provider / 3rd wire format.
- [x] **A3 · OpenRouter provider** (S) — one key → 200+ models, OpenAI-compatible. `OPENROUTER_API_KEY`.
- [x] **A4 · `vanta setup` wizard** (M) — provider picker → hidden key prompt → **merge** into `vanta-ts/.env` (pure `upsertEnv`, preserves all other keys) → model w/ default → persist (0600). Unit + integration tested.
- [x] **A5 · First-run detection** (S) — no resolvable backend on launch → auto-run `vanta setup`, **TTY-gated** (non-interactive callers told to run `vanta setup`, never block). Wired `setup`/`status`/`doctor` commands.
- [x] **A6 · `vanta status` / `vanta doctor`** (S) — boxed health: kernel **ping only** (never spawn), provider+model, per-provider key **presence** (✓/✗, never the value), store + skill/memory/goal counts. Live-verified.

### B — Self-improvement loop  ← ✅ SHIPPED 2026-06-02 (live-verified on Gemini)
- [~] **B1 · Hook spine** — **DEFERRED** (same call as A2): the review is wired directly at the post-turn site in both callers; one consumer doesn't justify a generic 5-event bus. Build it at the 2nd consumer (Rule of 3).
- [x] **B2 · Post-turn nudge counters** (S) — pure `shouldReview(toolIterations, turnIndex, env)`: fires on a busy turn (≥`VANTA_REVIEW_MIN_TOOLS`, default 6) or periodically (every `VANTA_REVIEW_EVERY`, default 8). `toolIterations` added to `AgentOutcome`. `VANTA_SELF_IMPROVE=0` disables.
- [x] **B3 · Background-review fork** (M) — `review/background-review.ts`: post-turn, spawns a tool-restricted agent (`recall` + `write_skill` only), replays the transcript, review prompt biased to act with the do-NOT-capture list. Best-effort — never fails the main turn. Live-verified (judged "no skill" on a trivial turn; unit-tested write path).
- [x] **B4 · Skill provenance + safe curator** (M) — review-written skills tagged `vanta-learned` (`LEARNED_TAG`); curator **never auto-deletes** (archives only `vanta-learned` stale skills — reversible; reports stale hand-authored + long-archived instead of touching them); `maybeCurate()` wired at session start, 7d-interval-gated via `~/.vanta/.curator_state.json`.
- [~] **B5 · Memory pre/post-turn** — **PARTIAL**: post-turn memory already written (`writeRunMemory`); pre-turn recall already injected (`recentMemory`→prompt). Remaining: move recall from the system prompt's volatile tier into the user message to preserve prefix-cache (optimization, deferred).

### C — Continuity  ← ✅ SHIPPED 2026-06-02 (live-verified resume on Gemini)
- [x] **C1 · Session persist + resume** (M) — **file-based** (`~/.vanta/sessions/<id>.json`, id `YYYYMMDD-HHMMSS`), not SQLite — dependency-free + git-versionable, consistent with skills/memory (avoids Node's flagged experimental `node:sqlite`). `sessions/store.ts` (zod-validated round-trip), `createConversation(...,{history})` seeds prior turns + fresh system prompt, `vanta sessions` lists newest-first, `vanta resume <id>` / `vanta --resume <id>` rehydrates. Saved after every turn. Bonus: fixed REPL Ctrl+D/EOF to exit cleanly instead of erroring.

### D — Borrow the skills library  ← ✅ SHIPPED 2026-06-02
- [x] **D1 · Port skills** (M) — 10 high-value skills ported into bundled `vanta-ts/skills-library/` (coupling stripped: env vars renamed to `VANTA_*`, `delegate_task`→delegate subagent, external-agent-specific TUI/kanban removed), with `vanta skills install [--force]` → idempotent, non-destructive copy into `~/.vanta/skills/` (`skills/library.ts`). Ported: systematic-debugging, test-driven-development, writing-plans, requesting-code-review, spike, humanizer, github-pr-workflow, claude-design, duckduckgo-search, build-retro. Live-verified install (10/10).
- [ ] **D2 · Skill bundles** (S) — adopt a YAML bundle schema (`name`/`description`/`skills:[]`/`instruction`) so one `/slash` loads several skills. *Why:* composite operator commands. (Pending — not blocking.)

### E — Autonomy & reach  ← daemon is the keystone (E1 shipped; E2–E6 pending)
- [x] **E1 · Daemon / service mode** (M/L) — ✅ SHIPPED 2026-06-02. `vanta gateway` foreground daemon (`gateway/run.ts`: interruptible tick loop over `runDueTasks`, SIGINT/SIGTERM-clean, one bad task non-fatal). launchd service manager (`service/`: pure plist gen + `vanta service install|uninstall|status`, captures PATH so launchd finds node/cargo). Cron no longer needs an external trigger. Verified: foreground daemon starts/ticks/stops; `service status` read-only. (`launchctl load` not auto-run — installing a persistent agent needs the user's OK.)
- [x] **E2 · Telegram gateway** (M) — ✅ SHIPPED 2026-06-02 (offline-tested; live needs a bot token). `PlatformAdapter` contract (`gateway/platforms/base.ts`) + `TelegramAdapter` (getUpdates long-poll + sendMessage, pure `parseUpdates`/`parseAllowlist`, chat-id allowlist). Wired into the gateway: each tick polls, runs inbound → agent turn → reply (`pollPlatform`, handler error becomes the reply). Auto-enabled by `VANTA_TELEGRAM_TOKEN`. **Live use needs a @BotFather token** (I can't provision one). *Limitation:* each message is a one-shot run (no per-chat session yet — future, key sessions by chatId). Other ~19 platforms deferred (Rule of 3).
- [x] **E3 · Webhook triggers + deliver targets** (M) — ✅ SHIPPED 2026-06-02 (HMAC + HTTP integration-tested). `gateway/webhook.ts`: constant-time `verifyGithubSignature` (sha256 HMAC, known-vector tested), `resolveDeliver` (`local`/`file:<path>`/`telegram:<chatId>`), `startWebhookServer` (POST-only, HMAC-gated, 200-fast + background agent run). Wired into the daemon (`VANTA_WEBHOOK_PORT`/`_SECRET`/`_PROMPT`/`_DELIVER`); inbound event → agent turn → deliver. Verified via real localhost requests (200 signed / 401 unsigned / 405 non-POST).
- [~] **E4 · Interrupt** (S) — ✅ SHIPPED 2026-06-02 (unit-tested). `AbortSignal` in `AgentDeps`, checked between loop iterations → `stoppedReason: "interrupted"` (post-run memory still runs). Ctrl+C aborts a one-shot `vanta run` gracefully instead of hard-killing. **Steer (mid-turn message injection) deferred** — needs non-blocking stdin during a turn (a REPL redesign); low value in the current synchronous loop.
- [x] **E5 · MCP client** (M) — ✅ SHIPPED 2026-06-02 (protocol unit-tested; live needs a real MCP server). Dependency-free stdio JSON-RPC client (`mcp/client.ts`, injectable transport — initialize/tools-list/tools-call, concurrent-request correlation, error→reject) + `mcp/mount.ts` (config from `VANTA_MCP_SERVERS` or `~/.vanta/mcp.json`, spawns each server best-effort, registers discovered tools as Vanta tools through the **same kernel `assess()`**). Mounted in `prepareRun` (no-op without config). StreamableHTTP transport + per-chat reuse = future; direct Google integrations kept as-is.
- [ ] **E6 · ACP server wrapper** (L, optional) — implement ACP `Agent` methods over Vanta's session + delegate primitives so editors (Zed/Claude-Code-style) can drive Vanta. *Why:* networked cross-agent without inventing a protocol. Lowest priority.

### F — Robustness steals (cheap, fold in opportunistically)
- [x] **F1 · Message sanitization** (S) — `sanitizeMessages` (context.ts), run pre-flight before every model call: drops orphaned tool_results + strips lone Unicode surrogates (keeps valid emoji pairs). *Prevents silent 400s.*
- [x] **F2 · Loop guardrails** — ✅ SHIPPED 2026-06-02. Stops on 3 consecutive empty results (`MAX_CONSECUTIVE_FAILURES`) AND on the same tool+args called 3× in a turn (`MAX_IDENTICAL_CALLS` — stuck-in-a-rut detection). Unit-tested.
- [ ] **F3 · Subdirectory hints** (S) — inject cwd hint after file/shell tool results.
- [~] **F4 · Retry w/ jittered backoff** — the `openai` SDK already retries with backoff (maxRetries default 2); explicit per-model tracking deferred unless we hit limits.

### G — Subscription auth  ← G1 + G2(Codex) SHIPPED (grey area, user-run)
- [x] **G1 · Claude subscription (`claude-code` provider)** — ✅ SHIPPED 2026-06-02 (unit-tested; **user live-verifies** — the harness blocks the assistant from running it as credential-repurposing). `VANTA_PROVIDER=claude-code` uses your Claude Pro/Max OAuth token (from `~/.claude/.credentials.json` or `CLAUDE_CODE_OAUTH_TOKEN`). The earlier "not viable" was WRONG — it works with the full Claude-Code header set + system-prompt spoof (see DECISIONS reversal). **Grey area** under Anthropic ToS; the wizard labels it as such. API keys remain the clean path.
- [x] **G2 · ChatGPT-Codex OAuth** — ✅ SHIPPED 2026-06-02 (unit-tested + **live-verified** end-to-end with real `~/.codex/auth.json`; user-run, same grey-area as G1). `VANTA_PROVIDER=codex` uses your ChatGPT subscription via the Codex CLI's OAuth session — Responses API at `chatgpt.com/backend-api/codex`, refresh + write-back to the shared `~/.codex/auth.json`. The earlier "deferred, same gating as Claude" was WRONG: the Codex backend accepts subscription tokens (see DECISIONS reversal). `providers/codex.ts` + `codex-auth.ts`. **Gemini-CLI OAuth still deferred** — API keys cover Gemini; revisit only if asked.

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

## v1.1 — Feature parity (2026-06-02) — CORE COMPLETE
Founding mandate: broad capability + kernel-enforced safety as the differentiator. **Full audit + gap matrix: [`docs/feature-audit.md`](docs/feature-audit.md) — all 8 manifesto hard lines verified in code; core parity met.** P1/P1b/P2/P3/P4/P5 shipped 2026-06-02; remaining deltas (session search, more platforms, desktop/web UI, skill breadth) parked by design.

- [x] **P1 + P1b · Slash-command parity** — ✅ SHIPPED 2026-06-02. `/history /retry /undo /reset` (commits `73bf5c6`) + `/title /fork` (`2285270`), both readline + TUI. `/redraw` dropped (TUI auto-renders). Known minor gap: TUI `/undo` retracts model history but not the rendered transcript (needs a reducer action) — readline is fully correct.
- [x] **P2 · Memory parity** — ✅ SHIPPED 2026-06-02. Injection was already capped; added a **stored-file cap** (`VANTA_MEMORY_MAX_BLOCKS`, default 50) — older blocks pruned from the live file but git-retained. (Memory compression deferred — optional.)
- [x] **P3 · Self-improvement parity** — ✅ SHIPPED 2026-06-02. Curator + `write_skill` + background-review (track B) were present; closed the real gap = **skill-index injection** (`buildSystemPrompt` injects names+descriptions; `recall` now loads the full body on demand). Index-in-prompt / body-on-demand / curator pattern complete.
- [x] **P4 · Identity reframe** — ✅ SHIPPED 2026-06-02. `prompt.ts`: default soul + rules reframed from repo-confined coding tool → "trusted personal operator" operating across the user's digital life (code/research/comms/calendar/web/business) while keeping goal-gating + verified-output + honest-about-limits. Rule 5 changed from "Never write outside root" → "file writes stay within root; the kernel gates everything else." Safety stays code-enforced (`resolveInScope` + kernel `assess`), independent of wording. 457 green, tsc clean.
- [x] **P5 · Capability breadth (banner)** — ✅ SHIPPED 2026-06-02. Both banners (TUI + readline) now group tools by **domain** (`tui/capabilities.ts`), reading like a personal operator. Adding more tools is demand-driven.
- [~] **P6 · Skills — PARKED.** Curate a small high-value set later, demand-driven. Lowest priority.

## v1.3 — Autonomy + senses (requested 2026-06-02, rapid-fire)
- [x] **O1 · Agent-chosen model on delegate** — ✅ SHIPPED. `delegate` provider/model params + tool description. Agent routes subtasks to any backend (Ollama, Gemini, etc.).
- [x] **O2 · Swarms** — ✅ SHIPPED. `tools/swarm.ts` — parallel multi-agent workers, fan-out + synthesize.
- [x] **O3 · Eyes (screen)** — ✅ SHIPPED. `look_at_screen` — `screencapture -x` → vision model. Needs Screen Recording permission.
- [x] **O4 · Camera** — ✅ SHIPPED. `look_at_camera` — webcam frame → vision model.
- [x] **O5 · Video** — ✅ SHIPPED. `watch_video` — ffmpeg frame extraction → vision model.
- [x] **O6 · Self-directed model selection** — ✅ shipped with O1.
- [x] **O7 · Speech & audio** — ✅ SHIPPED. `speak` (TTS via `say`) + `transcribe` (STT via whisper).
- [x] **O8 · Self-improving via the web** — ✅ SHIPPED (behavior). Prompt rule 9 + brain Growth drive directs the agent to browse and write skills from what it learns.
- [x] **O9 · Self-improving codebase ("dark factory")** — ✅ SHIPPED 2026-06-03. `factory/` module: triage → plan → execute → verify → commit. Kernel-enforced: `is_protected_path` blocks writes to `src/*.rs`, `factory/*.ts`, `MANIFESTO.md`. `vanta improve` (review mode) + `vanta factory approve` (auto). Live-verified end-to-end.

## v1.5 — Efficiency & emergent brain (requested 2026-06-03)
Target hardware: MacBook Pro 14" M4 Pro / 48GB / macOS Tahoe — must run lean here.
- [~] **E-eff1 · Token + power frugality** — agent uses as few tokens / as little power as it can, "however it sees fit": concise by default, prefer LOCAL (Ollama) models for simple subtasks via delegate, trim prompt injection when context is tight. Bake a frugality directive into the prompt + brain drives. (directive shipped; routing heuristics next)
- [ ] **E-eff2 · Prefer-local routing** — auto-route simple/cheap work to local Ollama on the M4 Pro (free, low-power); reserve paid frontier models for hard reasoning. Extends model routing + delegate.
- [ ] **B-v2 · Emergent self-designed brain** — beyond md files: let Vanta design its OWN brain representation (its own code/format/tech) that humans don't need to read. The md brain (v1.4) is the bootstrap; v2 lets Vanta evolve the substrate under the kernel's rules. (research + careful — high blast radius.)
- [ ] **META · Don't stop until complete** — standing directive: work the whole backlog top-down, commit + push every slice, until done. (Active.)

## v1.6 — MCP: use · make · serve (requested 2026-06-03)
Vanta as a self-extending operator: consume any MCP server, build/hook in new ones on
its own, and be callable as a server itself. Extends **E5** (MCP client, shipped). Built
in order — each phase ships working before the next starts (anti-drift: no three-half-things).
- [x] **MCP-1 · Use any MCP (consume)** (S) — ✅ SHIPPED 2026-06-04. `readMcpConfig` now accepts Claude's `mcpServers` key (alongside `servers`) and discovers `./.mcp.json` in the project (project wins over `~/.vanta/mcp.json`; `VANTA_MCP_SERVERS` still wins inline). `vanta mcp list` lists configured servers. Config discovery done + unit-tested (+4 tests); live consume needs a real server.
- [x] **MCP-2 · Make + hook in at runtime** (M) — ✅ SHIPPED 2026-06-04. **`mount_mcp` tool** (`tools/mount-mcp.ts`): `buildMountMcpTool(registry)` factory spawns an MCP server, mounts its tools into the LIVE registry mid-session, kernel-gated via `assess()` (`describeForSafety` → "spawn mcp server …"). **`build-mcp-server` skill** (`skills-library/`): teaches Vanta to scaffold a TS MCP server with the SDK, build it, and mount it. **Done =** mount_mcp registers a server's tools into the running registry; skill covers scaffold-on-demand.
- [x] **MCP-3 · Be a server (serve)** (M/L) — ✅ SHIPPED 2026-06-04. **`vanta mcp serve`** (`mcp/server.ts`): exposes Vanta's tools over MCP stdio (JSON-RPC 2.0, mirror of `client.ts`). Every `tools/call` routes through the kernel `assess()` gate — `block`/`ask` refused as `isError` results (headless: no human to prompt), only `allow` executes. Read-only **allowlist** (`VANTA_MCP_SERVE_TOOLS`, defaults to 9 read-only tools) bounds exposure; the kernel is the real boundary. `console.log→stderr` keeps the protocol stream clean. **Done (live-verified):** a real `McpClient` drove the `vanta mcp serve` subprocess end-to-end — handshake, `tools/list` (filtered), `read_file` allow→executed, out-of-scope refused, non-allowlisted refused. *Claude Code integration itself untested (offline-verified via reciprocal client, house discipline like E2/E5).* Supersedes **E6** (ACP wrapper).

## v1.4 — Selfhood & continuous learning (requested 2026-06-02/03)
The agent grows an identity and a living model of its world. Everything here stays
under the kernel's hard lines (non-destructive, verified, approval-before-risk).
- [x] **S1 · Self-authored identity files** — ✅ SHIPPED. Brain regions (`~/.vanta/brain/`: identity, semantic, episodic, user_model, drives, reflections, mood). `brain` tool + `/memory`. `SOUL.md` + `AGENT-MANIFESTO.md` at repo root.
- [~] **S2 · Personality develops from interaction** — PARTIAL. Brain `user_model` region + prompt rule 9 drives it. Full personality.md evolution loop is demand-driven.
- [~] **S3 · Continuous world/user/codebase context** — PARTIAL. Brain regions + post-turn memory cover this. Full heartbeat-driven refresh ties to S5.
- [~] **S4 · Skill authorship discipline** — PARTIAL. Curator uses `LEARNED_TAG` + never-auto-deletes. Versioning/merge on `write_skill` deferred.
- [ ] **S5 · Heartbeat** — steady tick driving S2/S3 selfhood updates + factory loop. Gateway daemon exists (E1); wiring the selfhood updates onto it is the remaining piece.

## v2 — Living operator & JARVIS arc (requested 2026-06-05)
> Status source: `roadmap.json` (29 new items). Synthesis + build order + the not-evil charter:
> [`docs/living-operator.md`](docs/living-operator.md). Direction locked in `DECISIONS.md` (2026-06-05).

From three captures (`vanta wants.rtf`, `argowants2.rtf`, `agro wants 3.md`) + two live goals (natural
voice; sentience-like continuity). **Sentience as a direction, not a claim.** Most of `argowants2`'s
"brain architecture" is already shipped (BRAIN-*, EF-*, MEM-*, senses O3–O7) — the new work is
connective tissue + a few organs, not a new brain.

- **Arc A — Living operator (spine, near-term).** Continuity/honesty/learning that makes Vanta
  trustworthy + alive-like. Rocks: `MEM-CURATOR` (the named first slice — compress sessions →
  durable notes), `MEM-FORGET`, `TRUST-LABELS`, `SCAFFOLD`, `VOICE-NATURAL`, `CHARTER`. Pebbles/sand:
  `REFLECT-CORRECT`, `TASTE-ENGINE`, `ANTI-SLOP`, `SELF-EVAL`, `PROJECT-RADAR`, `ENERGY-PLAN`,
  `COMMS-TRIAGE`, `PROTOCOLS`, `RESEARCH-LOOP`, `BETTER-ENDINGS`, `ACTION-PROOF`, `COST-VISIBLE`,
  `DECISION-GUARD`. Horizon: `WORLD-MODEL`, `LIFE-SEARCH`, `AMBIENT`.
- **Arc B — JARVIS / command center (breadth, build small, later).** Omni-capable, non-evil,
  human-aligned life/world partner; business is *one facet*, not the identity. `LIFE-OS-SCHEMA`,
  `AGENT-COUNCIL` (15 bounded roles), `PROTECTION-AGENT`, `BRIEF-CMD` (`vanta today`/`brief`),
  `MONEY-OS` (`vanta money` + escape-the-9-to-5), `REVIEW-LOOPS`; horizon `COMMAND-CENTER`.
  Jason's own rule: *do not build full JARVIS at once.*

## SHIPPED in the 2026-06-02/03 build marathon (all committed + pushed)
**501 TS + 21 Rust tests green, tsc clean.** Across v1.1–v1.5:
- **Providers:** Codex ChatGPT-OAuth, claude-code; agent-chosen model on `delegate` (O1/O6) + workers get skill index + brain.
- **Senses:** native image input (paste/drag-drop/`/image`/`/paste`/`/attachments`); `look_at_screen` (eyes, O3); `watch_video` (O5); `speak` TTS (O7); vision routed through the ACTIVE provider.
- **Selfhood:** Vanta **brain** (`~/.vanta/brain/`, 7 regions, neurodivergent-first identity, frugality drive) read each session + `brain` tool + `/memory`.
- **UX:** queued type-ahead (U1), notifications (U3), real token usage (U4), `/compress` (U5), `/memory` (U6), `/export` (U7); full command set incl. `/goal /plan /title /fork /history /retry /undo /usage /copy /update`.
- **Skills/memory:** skill-index injection + recall-body, capped memory, `skills lint`, in-session `todo`+`/plan`.
- **Safety (manifesto-critical):** kernel `assess_action` hardened against known denylist/scope bypasses (broadened set, interpreter vectors, absolute-path-outside-root).
- **Efficiency:** token/power frugality directive; prefer-local delegation. **Installer:** `bootstrap.sh`. **Docs:** MANIFESTO + feature-audit + claude-cli-gaps; CLAUDE.md kept current.

## ALSO SHIPPED in the marathon (continued)
O2 swarms · O4 camera (`look_at_camera`) · O5 video (`watch_video`) · O7 speak (TTS) + transcribe (STT) ·
volatile skills (#36656) · `/context` · `/mcp` · `/export` · `/compress` · `/memory` · `/plan`+todo ·
`skills lint` · O8/S2/S3 continuous-self-improvement behavior (prompt rule 9 + brain Growth drive).

## SHIPPED 2026-06-04 (build sprint — session 2)
**751 tests green (27 Rust + 724 TS) · tsc clean · pushed · all files ≤300 lines.**
- **KANBAN-S2 · Drag-and-drop roadmap board:** `roadmap/server.ts` — `GET /roadmap/board` serves `roadmap.html`; `POST /roadmap/move` → `moveRoadmapItem` live. `vanta roadmap serve` builds + opens `http://localhost:7789/roadmap/board`. Drag a card between columns → board reloads.
- **TUI-INPUT · Composer history + multiline:** up/down arrows cycle sent messages (`navigateHistory` pure helper, tested). Shift+enter inserts `\n` at cursor (modern terminals). History active only when slash/@ palette not showing.
- **TUI-MARKDOWN · Markdown rendering in transcript:** `tui/markdown.tsx` — `tokenizeInline` (**bold**, `code`) + `parseBlocks` (h1-3, bullets, numbered, fenced code, spacer) + `renderMarkdown` Ink renderer. Committed assistant entries route through it.
- **ND1 · /next:** reads active kernel goals → sends agent a one-shot "concrete next micro-step" prompt. `repl/next.ts` + wired in HANDLERS + SLASH_COMMANDS.
- **ND3 · /planmode:** toggle plan-first mode via `PLAN_MARKER` injection into live system prompt. `/planmode [on|off]`. `repl/plan-mode.ts`.
- **U2 · @-file context:** `tui/at-context.ts` — `parseAtRefs`, `activeAtRef`, `buildContextBlock`, `listRepoFiles`. TUI shows @ autocomplete palette (↑↓ tab); on submit, `@path` refs are resolved to `<file>` context blocks prepended to the agent message.
- **Compliance cleanup:** extracted `app-reducer.ts` + `useAgentSend` hook; `app.tsx` 398→178 lines; `parseBlocks` 58→22 lines; all new files ≤300, all non-component fns ≤50.

## SHIPPED 2026-06-03 (post-marathon session)
**581 tests green (27 Rust + 554 TS) · tsc clean · pushed.**
- **Bug fixes (4):** dropped file paths treated as slash commands (readline + TUI) · video drops not routed to `watch_video` · `look_at_screen` cryptic permission error → friendly hint · agent falsely claimed Desktop image paths were out of scope.
- **O9 dark factory (complete):** `factory/` module (triage/planner/executor/verifier/run) · kernel `is_protected_path` (27 Rust tests) · `vanta improve` + `vanta factory [approve|status]` CLI · gateway detached-child spawn for `__factory__` cron entries · `AGENT-MANIFESTO.md` · live end-to-end verified (verifier correctly rejected a bad model output, discarded cleanly).

## RESIDUAL — open-ended or demand-driven (not blocking daily use)
- **B-v2 · Emergent self-designed brain** — agent designs its own brain substrate (its own format/code). Open research; the md brain (S1) is the bootstrap. No clear done line — pursue when the md brain feels limiting.
- **S5 · Heartbeat selfhood updates** — wire brain writes onto the gateway tick so identity evolves continuously. Small, concrete, low urgency.
- **E-eff2 · Prefer-local routing** — auto-route cheap work to local Ollama. Extends `model-router.ts`. Small.
- **Polish tier:** themes · `/vim` · multi-dir `/add-dir` · S4 skill-versioning-on-write · cron-output-awareness (gateway). *(U2 @-mentions shipped 2026-06-04)*
- **D2 · Skill bundles** — YAML bundle schema for composite slash commands. The factory can implement this.
- [x] **SCOPE-2 · Readable zones (read across the workspace)** (S) — ✅ SHIPPED 2026-06-04. The read-side mirror of SCOPE-1. `read_file` hard-refused out-of-repo reads, so Vanta couldn't read a sibling repo's skills (`~/Documents/GitHub/theft-kit/...`) even though `shell_cmd cat` could. Now `read_file` reads from **readable zones** — default = the project's **parent dir** (so sibling repos in the same workspace are readable) + the writable zones; `VANTA_READABLE_DIRS` override. Generalized `isInWritableZone`→`isInZone` + `resolveReadableZones(env,root)` in `tools/writable-zones.ts`; `~`-expansion. **Verified:** unit (12 zone + 2 read_file) + live (read `theft-kit/design-html/SKILL.md`, 64 KB; `~/.ssh/id_rsa` still refused). **Follow-up:** secret-filename read-guard (`.env`/`*.key`/`id_rsa`) even in-zone — readable zones currently expose sibling secrets to kernel-Asked reads.
- [x] **SCOPE-1 · Writable zones beyond the repo** (S) — ✅ SHIPPED 2026-06-04. `write_file` no longer hard-refuses out-of-repo paths; it writes into **bounded, approval-gated writable zones** (`tools/writable-zones.ts`: default `~/Desktop` + `~/Downloads`, `VANTA_WRITABLE_DIRS` override). **TS-only** — the kernel already returned `Ask` for out-of-root paths (`mentions_outside_home`/`references_abs_path_outside_root`, safety.rs:71), so dispatch already prompts the human; the tool was simply stricter than the boundary and refused *after* approval. Now: in-repo writes free, in-zone writes proceed (kernel Asked at dispatch), **out-of-zone still refused** (the backstop against yes-fatigue on `~/.ssh`). `~`-expansion + prefix-collision-safe (`Desktop-evil` ≠ `Desktop`). Chose **bounded zones** over any-path-with-approval. **Verified:** unit (9 zone + 2 write_file) + live (wrote directly to `~/Desktop` in one step).
- [x] **O10 · Autonomy ladder (L1–L4, kernel-bounded)** (M) — ✅ SHIPPED 2026-06-04. Replaced the factory's binary review-vs-auto with a selectable level in `factory/run.ts`: **L1** suggest (plan, no branch) · **L2** implement (branch→execute→verify, stop for diff review) · **L3** commit (no push) · **L4** push. `resolveAutonomyLevel(sub, env)` maps `improve`→L1 and `approve`→`VANTA_AUTONOMY_LEVEL` (default 4, preserving prior commit+push). Split `commitAndPush`→`commitSlice`+`pushBranch`; added `implemented` + `committed{pushed}` CycleResult statuses. The kernel's `is_protected_path` still blocks skeleton/brainstem (kernel/factory/manifesto) at **every** level — the ladder governs reach over writable code only. **Verified:** 15 `run.test.ts` (incl. `resolveAutonomyLevel` clamp/default/garbage), tsc clean. **L6** (edit safety-critical code) remains **not grantable by config** — out-of-band human approval only.
- [ ] **O10b · Autonomy L5 (auto-merge low-risk)** (M) — the reserved 5th rung, deferred from O10 as the riskiest. Auto-merge a pushed factory branch only when a **low-risk classifier** passes: non-protected TS only, all tests green, no dep/schema/env/migration change, diff under a bound. Merge into a non-default branch or behind a flag; never force; never the default branch without approval. Currently `VANTA_AUTONOMY_LEVEL=5` clamps to L4. **Done =** a low-risk verified slice auto-merges; anything failing the classifier stops at L4 push.
- [ ] **O11 · Compartmentalized self-repair (the body model)** (M) — the static tier map that O10's dial operates within. Classify the codebase by self-modification risk, in body terms: **skeleton** = safety kernel + policy (`src/safety.rs`, `scope.rs`, `Cargo.*`) — never autonomous, already blocked by `is_protected_path`; **brainstem** = runtime loop (`agent.ts`, `providers/`, `factory/`) — review + tests only (factory TS already protected); **limbs** = tools (`tools/*.ts`) — freely improvable, build-in-sandbox → test → ask-before-attach; **reflexes** = skills — already self-evolve via background review (B3/B4); **memory** = brain/memories — already autonomous. Requirements: (1) an explicit tier→max-autonomy-level map; (2) the factory refuses to exceed a compartment's cap (a limb fix can reach L4, a brainstem change caps at L2-review); (3) "broken leg" workflow — replace a limb in isolation while the body keeps running, rollback on fail; (4) document the model so the boundary is legible. **Done =** the tier map exists and the factory enforces per-compartment caps — limb fixes flow autonomously, brainstem/skeleton don't. *Mostly formalizes + extends what `is_protected_path` already enforces.*
- [x] **INSTALL · One-line curl install** (S) — ✅ SHIPPED 2026-06-04. `bootstrap.sh` (repo root) clones Vanta into `~/vanta` (`VANTA_DIR` override; default branch — no pin, so it self-adjusts when `main` is cut) then `exec`s the existing `install.sh`. Idempotent (re-run fast-forwards). `install.sh` has **no interactive prompts**, so a piped install can't crash (setup stays a separate `vanta setup` step). README documents the one-liner. **Verified:** clone + `install.sh` handoff via a local clone smoke. *The `curl … raw.githubusercontent.com | bash` one-liner activates when the repo flips public; while private, clone via git auth.*
- [x] **SEC · Secret-hygiene hardening** (S) — ✅ SHIPPED 2026-06-04. **`gitleaks` pre-commit hook** (`scripts/pre-commit` → symlinked into `.git/hooks/` by `install.sh`) runs `gitleaks protect --staged --config .gitleaks.toml` and blocks any secret-shaped string. `.gitleaks.toml` extends the default ruleset + allowlists `.example` twins and test fixtures. `.mcp.json.example` committed; real `.env`/`.mcp.json` stay gitignored. **Rule: a token in a gitignored file is safe; a token in a commit is burned.** *(False-alarm 2026-06-03 that prompted this: the cosmos `.mcp.json` token was gitignored and never committed — history scan clean, no rotation. The hook removes the guesswork.)*

## v1.2 — Claude-CLI UX parity (non-coding) — gap analysis 2026-06-02
Full grounded gap list: [`docs/claude-cli-gaps.md`](docs/claude-cli-gaps.md) (vs Claude Code 2.1.156, coding-specific features excluded, Vanta side verified against the repo). Build order:
- [x] **U1 · Queued input while busy** — ✅ SHIPPED. Type-ahead queue in TUI reducer + readline; drained on turn end.
- [x] **U2 · @-file mentions** (★★★) — ✅ SHIPPED 2026-06-04. TUI @ autocomplete palette (↑↓ tab) + context injection on submit (`tui/at-context.ts`). See session 2 entry above.
- [x] **U3 · Notifications** — ✅ SHIPPED. Terminal bell + `osascript` desktop ping on turn-complete and approval-needed.
- [x] **U4 · Real token/cost usage** — ✅ SHIPPED. Provider `usage` fields captured → exact tokens in `/usage` + status bar.
- [x] **U5 · /context + /compress** — ✅ SHIPPED. `/context` shows token-budget breakdown; `/compress` triggers manual compaction.
- [x] **U6 · /memory quick-add** — ✅ SHIPPED. `/memory <text>` appends to brain semantic region mid-turn.
- [x] **U7+ · export · /mcp · /copy · /update** — ✅ SHIPPED. `/export` (markdown transcript), `/mcp` (list servers), `/copy` (clipboard), `/update` (git pull). Multi-dir `/add-dir` + themes + `/vim` remain demand-driven.
Shipped already vs Claude CLI: image paste/drag-drop, slash palette, /model picker, /copy, /usage, streaming, approvals.

**Self-evolving agent research takeaways (Nemotron Labs, 2026):** The skill-bloat answer is NOT fewer/curated skills — it's **management**: inject only the skill *index* (names+descriptions) into context, adaptive-search to pull a full skill *body* on demand, and a background **curator** that prunes/compresses/revises the library. Vanta already has the curator (track B); the missing piece is **index-only injection + on-demand body load** (currently Vanta lists skills but should verify it's not over-injecting). Memory layer is **capped and pruned** (relevance decays over time). Identity carries a persona + "rules of engagement" + a sense of shared history with the user (loyalty) as prompt-injection resistance, paired with hard kernel boundaries. → This **reframes P6**: the win is the skill *system* (index/search/curator), so a small high-value seed set + good management beats bulk-porting.

## 2026-06-05 — Auxiliary-task delegation + operator self-improvement (captured)
Two goal-dumps this session. UI bugs (width fill · slash palette 8-item cap · skill-index trim) shipped inline. Rest captured here; build order set by leverage × effort.

**Auxiliary-task gap:** Bind each *function* (vision, summarization, title-gen, embeddings) to its own model, independent of the main agent model. Without this, a non-vision main model (DeepSeek V4 Flash, local text-only Ollama) silently breaks vision. AUX-VISION (shipped) re-introduces `VANTA_VISION_MODEL`; AUX-MAP generalizes it.
- [x] **AUX-VISION** (S) — ✅ SHIPPED 2026-06-05. `routing/vision.ts` (`visionEnv` pure + `resolveVisionProvider`); all 3 image tools (`describe_image`, `look_at_screen`, `look_at_camera`) route to `VANTA_VISION_MODEL` (+ optional `VANTA_VISION_PROVIDER`) when set, else the active provider (prior behavior). Fixes vision silently breaking on a text-only main model. 4 unit tests, full suite green (1067 TS), `.env.example` + both `CLAUDE.md` updated. *The explicit "delegate those vision tasks today" ask.*
- [x] **UI-READABILITY** (S) — ✅ SHIPPED 2026-06-05. TUI fills terminal width (removed 100-col cap, `tui/app.tsx`) · slash palette capped to 8 + fixed command column + width-clipped descriptions (`tui/transcript.tsx`, was unbounded ragged `space-between` → typing `/` dumped all 37) · `/skills` aligns names + clips to one line (`repl/handlers.ts`) · skill INDEX clipped per-line in the prompt (`prompt.ts` `trimSkillDesc`) so weak models stop parroting the library. 310 TUI/repl tests green.
- [x] **SCRUB-AI** (M) ✅ SHIPPED 2026-06-09 — stripped legacy-agent mentions from published surface (source code, README, ROADMAP, AGENTS.md); kept research docs (`docs/_recon`, `docs/agent-*`, `docs/feature-*`, `docs/platform-*`); branch renamed + merged to main.
- [ ] **AUX-MAP** (M) — generalize AUX-VISION into a per-function aux-task → model/provider map (vision · summarize · title · embed), one resolver extending `routing/model-router.ts`. Surfaced in `/status` + a `/aux` command + setup wizard.
- [ ] **UX-MODEL-FIX** (S) — *regression.* `UX-MODEL` is marked shipped (picker persists to `.env`, survives relaunch) but model choice is not sticking. Diagnose `setup.ts upsertEnv` + `/model` write path + launcher env precedence. **Done =** pick a model → still active next launch, proven by relaunch.
- [ ] **GOAL→ACTION** (S) — strengthen the headline ask: turn any vague goal into one safe, concrete, verified next action. Infra exists (`repl/next.ts`, `clarify` tool, nd-task-initiation) but is manual; gap = **auto-fire** a `/next`-style single-micro-step prompt on goal-set / vague input. Don't duplicate `next.ts` — trigger it.

**Operator-polish cluster (v2 — mostly strengthen existing infra, not greenfield):** verification discipline (never "done" without tool output) · richer auto-recall of past decisions · lower-friction safe autonomy · clean interrupt + state-preserve + pivot · operator personality (calm/direct, low social tax) · born-small composable artifacts · proactive drift self-monitoring · unified calendar/email/drive/code/web context. Each maps to a partial subsystem (EF gates, brain, comms tools); promote individually when one becomes the bottleneck.

- [ ] **DESKTOP** (XL → PARKED) — a desktop app to interact with Vanta (Tauri shell over the kernel HTTP API + a chat surface). Large; parked until the CLI/TUI operator loop is solid. See `PARKED.md`.

## 2026-06-05 — Operator upgrade backlog (prioritized · "go deep")

Synthesized from improvement dumps + the Vanta Brand Style Guide. **Key truth: most of these already have infrastructure — the work is usually wire / surface / auto-fire, not greenfield.** 105 capabilities shipped in v1; raw coverage is high. The real gap is **operator feel**: initiative, EF scaffolding, memory relevance, visual taste — behaving like a trusted operator, not a capable chatbot.

**Improvement → what Vanta already has → the real gap:**
- **Initiative** → `repl/next.ts` (`/next`), `clarify` tool, nd-task-initiation, EF gates → **auto-fire** on vague/goal-set + stalled-goal detection.
- **Memory** → brain regions (identity/semantic/episodic/user_model/…), capped+pruned `memory/store`, `recall`, curator → **relevance-gated surfacing** + durable-vs-noise classification.
- **Executive function** → EF gates (inhibit/set-shift/self-monitor/closure/research), `/wm` `/where` `/plan` todo store → **persistent task stack** (in-progress/blocked/parked/done) + **loop-closing**.
- **Autonomy** → gateway (cron+webhook+platform poll), factory L1–L4, launchd → **change-watchers** (repos/issues/email/cal) that draft + await approval.
- **Multimodal** → describe_image / look_at_screen / look_at_camera (now aux-routed), transcribe, watch_video → **aesthetic direction** + **compare visual options** (taste, not generic feedback).
- **Code op** → LSP, git tools, run_code, kernel protected-paths → mostly **discipline** (verify-before-claim, smaller patches) → prompt/SOUL.
- **Modes** → `modes/builtin.ts` (6 modes), `/planmode` → the named **build/debug/design/planning/body-double** modes + fast switching.
- **Communication** → SOUL + prompt rules + brand guide voice → **enforce** the direct/literal/operator register.
- **Tool reliability** → EF-ERRORDETECT, errors-as-values → **early fail-detect + safe retry + honest report**.
- **Operator dashboard** → kernel cockpit :7788, status bar, `/goals` `/plan` `/where` → a **unified live dashboard** in the brand dossier aesthetic (left-rail mission-control: goals · plan · blockers · recent · approvals · next move · memory).

### Prioritized sequence (rocks first; Jason's stated biggest = initiative · memory · visual · EF)

**Quick wins (now):**
- [x] **RESTART** (S·sand) — `/restart` slash command: tear down Ink cleanly + re-exec via a launcher loop (exit-code 75 → `run.sh` relaunches), optional kernel respawn. Unblocks the dogfood loop (reload tsx without manually quitting). *(asked explicitly)*
- [x] **TOOL-RETRY** (S·sand) — detect failed tool calls early; retry only when safe (idempotent reads); report exactly what happened. Extends EF-ERRORDETECT.
- [x] **BEHAVIOR-VOICE** (S·sand) — tune `SOUL.md`/prompt to the brand voice (direct, literal, structured, fewer caveats) + harden verify-before-claim. Covers comms (#8) + code discipline (#6).

**Rocks (operator-feel — Jason's stated biggest):**
- [x] **GOAL-ACTION** (S) — auto vague-goal → one concrete next action. *(tracked)*
- [x] **STALL-UNBLOCK** (S·pebble) — detect a stalled active goal → propose the smallest unblocker, unprompted.
- [x] **EF-TASKSTACK** (M·rock) — persistent operator task stack (in-progress/blocked/parked/done) + loop-closing ("I said I'd do X — did X happen?"). Builds on todo store + closure-gate + `/wm`.
- [x] **MEM-RELEVANCE** (M·rock) — classify durable facts vs session noise; surface memory only when relevant, never clutter. Builds on brain + `memory/store` + `recall`.
- [x] **OPERATOR-DASHBOARD** (L·rock) — live surface: goals · plan · blockers · recent actions · pending approvals · suggested next move · memory highlights, in the brand-guide dossier aesthetic (status rail, operation cards, signal colors). Subsumes brand-TUI; the seed for DESKTOP.
- [x] **VISION-COMPARE** (M·pebble) — aesthetic/design direction using operator taste; compare visual options side-by-side, not generic feedback. Builds on the aux-routed vision.

**Parity + modes:**
- [x] **MODES-v2** (M·pebble) — build / debug / design / planning / body-double modes + one-key switching. Extends `modes/builtin.ts`.
- [ ] **AUTO-WATCH** (M·pebble) — watchers (repos/issues/email/calendar) → draft action, await approval on risk. Extends gateway/webhook.
- [x] **AUX-MAP** (M) — per-function aux model map. *(tracked)* · **UX-MODEL-FIX** (S) — model-persistence regression. *(tracked)*

**Research (verify before building — expect high existing coverage):**
- [x] **USE-CASE-AUDIT** (S) — map 262 use cases → Vanta's 45 tools → coverage matrix; surface only genuine gaps.
- [ ] **CODEBASE-MINE** (M) — targeted read of reference agent codebases for specific stealable patterns (see `docs/feature-audit.md`). *(horizon)*
- [ ] **INSTALL-PARITY** (S) — setup/install UX parity (one-line `bootstrap.sh` exists; audit the wizard). *(horizon)*

**Gated:** SCRUB-AI (run last, force-push gated) · DESKTOP (horizon; OPERATOR-DASHBOARD is its seed).
