# CLAUDE.md — Vanta (repo root)

Read this first. Global `~/.claude/CLAUDE.md` conventions apply; only Vanta-specific facts are here. Don't re-derive what's below — it's the source of truth.

## What Vanta is

A local trusted-operator agent: knows the goal before it picks a tool, enforces scope on every action, reports only verified output. Full vision + roadmap in `docs/prd.md`. Prior architecture reference (what to steal/improve/replace) in `docs/agent-map.html`.

## Two layers

| Path | Layer | Language | Role |
|------|-------|----------|------|
| `src/` | `vanta-kernel` | Rust, zero deps | **Enforced** security boundary: risk classifier, approvals, goals, events, HTTP sidecar |
| `vanta-ts/` | `vanta` | TypeScript, Node 22 | Agent loop: LLM providers, tools, 3-tier prompt. Gates every action through the kernel |

The kernel is the boundary — `assess()` is a gate, not a suggestion. The TS layer orchestrates; it cannot bypass the kernel. Deep agent-layer docs: `vanta-ts/CLAUDE.md`.

## Commands

```bash
# Kernel (Rust)
cargo build && cargo test                 # 67 tests
cargo run -- doctor                       # health check, creates .vanta/
cargo run -- goals add "..."              # seed a goal
cargo run -- serve 7788                   # cockpit + JSON API

# Install the global `vanta` command (~/.local/bin launcher + ~/.vanta seed)
./install.sh                               # then `vanta` works from anywhere (no profile edit if ~/.local/bin is on PATH)

# Agent — from repo root (preferred): self-bootstrapping launcher
./run.sh                                   # interactive session (runs first-run setup wizard if unconfigured)
./run.sh setup                             # pick a model backend: openai | gemini | anthropic | openrouter | ollama
./run.sh doctor                            # agent-side health: kernel ping, provider, key presence, store, goals
./run.sh run "<instruction>"              # or ./vanta run "..." ; one-shot, kernel auto-starts
./run.sh help                              # list all subcommands

# Agent (TypeScript) — from vanta-ts/ (direct)
npm install
npm run vanta                              # interactive session (no args)
npm run vanta -- run "<instruction>"       # one-shot; kernel auto-starts if down
npm test                                  # all vitest tests
npx vitest run <pattern>                  # single test file or describe block
npm run typecheck                         # tsc --noEmit (must be clean)
```

```bash
# Reliability harnesses (from repo root) — drive the REAL agent, measure the readiness bar.
# Two-axis: RELIABILITY (terminates/clean-exit/no-zombie/survives-load = the bar) vs SUCCESS (correct output).
scripts/reliability-smoke.sh              # binary gate: real one-shot tasks exit clean
scripts/reliability-eval.sh               # tracked scored eval → docs/reliability-results.md
K=2 scripts/reliability-stress.sh         # repeated battery + concurrency burst
N=5 scripts/reliability-longrun.sh        # one big multi-stage task ×N, unattended
scripts/reliability-reach-staleness.sh    # deterministic: stale-qid → auto-heal+retry OR graceful degrade (no live X)
# VANTA_PROVIDER=ollama VANTA_MODEL=… … scripts/reliability-stress.sh   # cross-provider
```

## Kernel module map (`src/`)

| Module | Purpose |
|--------|---------|
| `app` | `State` (root + data_dir), `doctor`, `append_event`/`log_event`, `esc()` JSON escaper, legacy data dir migration |
| `safety` | `assess_action() → Verdict{Risk::Allow/Ask/Block}`. Keyword blocklist (destructive/exfiltration=Block), scope check (outside root=Ask), system/credential keywords=Ask, then a **reversibility** pass on the Allow tail (irreversible push/migrate/publish/deploy/history-rewrite escalate Allow→Ask; read-only/reversible stay Allow; file-writes are reversible authoring). Block floor runs first, never downgraded |
| `approvals` | `ApprovalQueue`, persisted `.vanta/approvals.tsv`. Only `Ask` actions queue; `Block` errors, `Allow` errors |
| `goals` | `GoalLedger`, `.vanta/goals.tsv` |
| `runtime` | `run_native()` — safety-gates then dispatches; returns `Unsupported` rather than silently falling back |
| `audit` | Tamper-evident hash chain over `events.jsonl` (per-install secret key) |
| `loops` | Loop ledger reader/writer (`.vanta/loops/*`): cockpit summaries, pause/resume/kill, escalation clearing |
| `scope` | Path containment (`inside_scope`) + protected-path enforcement |
| `server` | Raw TCP HTTP/1.1; inlined cockpit HTML const; all `/api/*` return JSON |

**Kernel API** (`127.0.0.1:7788`): `GET /api/status`, `POST /api/assess` (body=action→Verdict), `GET|POST /api/goals`, `GET|POST /api/approvals`, `POST /api/log` (body=event), `POST /api/run`, `GET *`→cockpit.

**Data dir** `.vanta/`: `events.jsonl`, `approvals.tsv` (`id\ttext\trisk\tneeds_human\tstatus\treason`), `goals.tsv` (`id\ttext\tstatus`), `goal-deps.json` (`{version:1,edges:[{blockerId,dependentId}]}`; TS graph overlay).

## Gotchas (will waste your time if you don't know)

- **`VANTA_ROOT` env var** overrides the kernel's cwd-based root. Set it when launching the kernel for a specific project. The TS launcher always passes it.
- **Stale kernel binary** may hold port 7788 from a previous build. If a new kernel won't bind, `lsof -nP -iTCP:7788 -sTCP:LISTEN` and kill the PID.
- Kernel must be reachable before the agent runs (launcher auto-starts it; needs `target/debug/vanta-kernel` built).

## Status

**v0.8.0 — roadmap-grind in progress.** Full v1 + Phase 2 EF + all S/M/L extensions, plus 4 Harness rocks shipped 2026-06-11 (session-memory, streaming tool-exec, message-display hook, shell-hooks engine), plus the **TUI build plan Phases 1–4** shipped 2026-06-12 (design tokens + glyphs, interactive footer, keybinding registry, mission-control `/cockpit` + slot composer), plus the **TUI full rebuild on real Ink 7** shipped 2026-06-13 (old `vanta-ts/src/tui/` render layer deleted; render now in `vanta-ts/src/ui/` + `vanta-ts/src/term/`; inline + `<Static>` scrollback, no AlternateScreen; `VANTA_UI2` gate removed — new render is the default), plus Tab/Shift+Tab focus traversal, the opt-in **TUI v2 mission-control shell** (`VANTA_TUI=v2`, `vanta-ts/src/ui/v2/`), Vite/React desktop renderer (`vanta-ts/desktop-app/`), per-tool permission request UIs, operator profile preferences, preference-signal capture, Ralph-loop filesystem continuity, goal dependency graph state (`/goal blocks`, `/goal blocked_by`, `vanta goals`), hook type parity (`command`/`http`/`mcp_tool`/`prompt`/`agent` in `.vanta/hooks.json`), full worker-backed `agent` hooks on live REPL/tool events, `VANTA-HOOK-EVENTS` shipped with all 30 hook events wired to Vanta-owned lifecycle/session/tool/MCP/file/worktree/fleet owners, deferred tool schemas where `tool_search` expands callable schemas on demand, subagent sidechain transcripts under `.vanta/sidechains`, shell-only OS sandbox mode (`VANTA_SHELL_SANDBOX=1`), `/verify` deterministic visual close-out requirements, and plain-English assertion judging via `nl_assertions`, memory guardrails, public LongMemEval/LoCoMo memory recall benchmark runner, parallel worktree fleet command, FABRO declarative workflow graphs behind `compose_workflow`, `/recover` failure-mode triage, auto-research metric improvement loop, meta-tuned `PROGRAM.md` instruction surface, per-task tool scoping, context-length compact retry, solutioning mode, and the opt-in runtime plugin framework. **terminal-love MCP** wired via `.mcp.json` (12 Terminal Trove design-reference tools as kernel-gated runtime tools). **Resume persistence age-gated**: restart carries prior thread only if recent (`VANTA_RESUME_MAX_AGE_MIN`, default 120; 0 = always clean); Ralph-loop progress in `.vanta/ralph-loop.json` is always surfaced paused until `/goal resume|drop`; `--fork-session` creates a separate seeded session when resuming. **Lifecycle init flags**: `--init`, `--init-only`, `--maintenance` run Setup/SessionStart shell hooks. **All TS passes the size gate** (file ≤300 / fn≤50 / params≤4 / cx≤10) — **no exemptions** (`factory/*` brought into compliance 2026-06-27: `run.ts`/`planner.ts`/`verifier.ts` refactored behavior-preserving, the `is_protected_path` kernel-mirror kept byte-identical; factory tests 105/105, full suite green). Plus the **operator rocks live-completed 2026-06-21**: voice STT (`voice/`, `voice_input` tool, real whisper push-to-talk), terminal capture (`term/terminal-capture.ts`, `terminal_capture` tool, tmux-backed — node-pty blocker resolved), Slack channel suggest (`comms/slack-channels.ts` + composer `#` autocomplete), tmux swarm (`fleet/tmux-*`, `vanta fleet tmux`), native desktop control (CHICAGO computer-use MCP route `mcp/chicago-*`, `vanta control`), personal LoRA tuning (`meta-tune/lora-*`, real MPS training, `vanta tune lora`), and a setup wizard that auto-configures desktop-control / voice / auto-tune (`setup/capabilities.ts`). Current source counts (real-counted 2026-06-26 via `ALL_TOOLS`/`buildRegistry().list()`/`SLASH_COMMANDS.length`): **123 built-in tools** (127 registered incl. factory `mount_mcp`/`tool_search`/`mcp_auth`/`run_pipeline`) · **128 slash commands**; last recorded full verify (2026-07-05, WEB-BACKEND-XAI-GROK slice): **11473 TS tests** (1015 files; live-gated voice/LoRA skipped) green (the lone `hooks/file-watch.test.ts` FSEvents flake passes in isolation — see ERRORS.md), `tsc` clean, size gate clean, **67 kernel tests** green. Run the TS suite from `vanta-ts/`, not the repo root (root config also scans the bundled `reference/` repos → spurious failures). Per-card statuses + notes in `roadmap.json`; release changelog in `CHANGELOG.md` (v0.3.0→v0.8.0, the release log since 2026-06-27); session-level detail through 2026-06-27 in `vanta-ts/CLAUDE.md` §"Session additions". **Install (2026-06-22 — SETUP-DEAD-SIMPLE shipped): zero-toolchain.** Only `git` is required; `install.sh`/`run.sh` source `scripts/setup-lib.sh` to download a checksum-verified prebuilt kernel (GitHub `releases/latest` — every release attaches all 4 platform binaries via `.github/workflows/release.yml`) + a portable Node 22 (nodejs.org) when missing; `cargo`/system-node only as fallback; `npm install --omit=dev` (runtime-only — `tsx`+`typescript` are runtime deps). **Repo is PUBLIC. 22 messaging adapters wired** (`vanta-ts/src/gateway/platforms/adapter-registry.ts` — QQ + WeChat added 2026-07-03, REACH-QQ-WECHAT). **Readiness bar — MEASURED (reliability hill-climb COMPLETE 2026-06-27; 6/6 `RELIABILITY-*` cards proven by executed runs):** "ready" = measured task-running reliability (Pillar 1's win condition — finish real multi-step tasks unattended, verified output), NOT feature count (DECISIONS 2026-06-26). Harnesses `scripts/reliability-{smoke,stress,longhorizon,longrun,eval}.sh` (two-axis: reliability = the bar vs success = model quality); tracked pass-rate in `docs/reliability-results.md`; state `docs/reliability-hillclimb.md`. Proven: long autonomous run **12/12** unattended · provider hardening (codex SSE idle-timeout + turn-loop bounded transient-retry, `agent/provider-call.ts`) · provider variance codex 100% / ollama 90% · kernel concurrency clean to **1024×** parallel · `vanta run` is the headless path, REPL is TTY-only (DECISIONS 2026-06-27). The harnesses found+fixed **3 real reliability bugs** (interactive-REPL exit hang `79fce703`, codex no-timeout `2a3ef344`, transient re-throw `7371d765`). See STRATEGY.md §"The readiness bar" + `vanta-ts/CLAUDE.md` §"Session additions (2026-06-27)". **Releases v0.3.0→v0.8.0 (2026-06-27→07-05, per-release detail in `CHANGELOG.md`):** v0.3 reliability hardening + measurement · v0.4 security-skills pack + CVE clear + modularity pass · v0.5 autonomous Docker-boxed agents + universal live reasoning in the TUI · v0.6 search-backend expansion (Exa/Firecrawl/Tavily/Parallel, `web_search` domain scoping + category/pagination), gateway channel self-heal, QQ+WeChat adapters, cross-agent memory import (`vanta migrate memory`), `/restore`, cross-process cron dedup, delegated-authority auto-approval in the ask gate, structural secret redaction at log-emit, MCP mount-time egress advisory, pluggability ports (prompt-tier/session-store/delivery-registry/display-formatter) · v0.7 `vanta governance export` (auditable report of every gated action), versioned `.env` + `vanta config rollback`, persisted spend ledger `/usage breakdown` by goal/agent/provider/model · v0.8 size-tiered `web_fetch` extraction (`tools/extract-pipeline.ts`; aux model + independent timeout via `VANTA_EXTRACT_MODEL/_PROVIDER/_TIMEOUT_SEC`) + xAI/Grok grounded-search backend (`VANTA_SEARCH_PROVIDER=xai`, native domain filters capped at 5).

**Direction:** `STRATEGY.md` — 5 pillars (**Harness > Operator > Solutioning > Extensibility > Cofounder engine**); external-agent parity is a reference, not a goal (DECISIONS 2026-06-11; 166 cards parked, see PARKED.md). Top open rocks now move past solutioning/plugin v1 into the remaining keyboard, preference, and want-engine slices; build-order export: `node scripts/build-order.mjs`.

**Live-setup caveats** (offline-unit-tested; live needs): browser → `npx playwright install chromium`; anthropic/vision → API keys; comms → provision OAuth client (`VANTA_GOOGLE_CLIENT_ID/SECRET`) + `vanta auth google`; LSP covers .ts/.tsx only; `vanta cron` is OS-scheduler-invoked. See `docs/prd.md`, `DECISIONS.md`, `PARKED.md`.

## Rule zero

No deletes, overwrites, out-of-scope writes, or secret handling without explicit approval. Enforced by the kernel on every tool call.
