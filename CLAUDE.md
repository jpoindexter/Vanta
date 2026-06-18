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
cargo build && cargo test                 # 53 tests
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

**v0.2.0 — roadmap-grind in progress.** Full v1 + Phase 2 EF + all S/M/L extensions, plus 4 Harness rocks shipped 2026-06-11 (session-memory, streaming tool-exec, message-display hook, shell-hooks engine), plus the **TUI build plan Phases 1–4** shipped 2026-06-12 (design tokens + glyphs, interactive footer, keybinding registry, mission-control `/cockpit` + slot composer), plus the **TUI full rebuild on real Ink 7** shipped 2026-06-13 (old `vanta-ts/src/tui/` render layer deleted; render now in `vanta-ts/src/ui/` + `vanta-ts/src/term/`; inline + `<Static>` scrollback, no AlternateScreen; `VANTA_UI2` gate removed — new render is the default), plus Tab/Shift+Tab focus traversal, the opt-in **TUI v2 mission-control shell** (`VANTA_TUI=v2`, `vanta-ts/src/ui/v2/`), Vite/React desktop renderer (`vanta-ts/desktop-app/`), per-tool permission request UIs, operator profile preferences, preference-signal capture, Ralph-loop filesystem continuity, goal dependency graph state (`/goal blocks`, `/goal blocked_by`, `vanta goals`), hook type parity (`command`/`http`/`mcp_tool`/`prompt`/`agent` in `.vanta/hooks.json`), full worker-backed `agent` hooks on live REPL/tool events, `VANTA-HOOK-EVENTS` shipped with all 30 hook events wired to Vanta-owned lifecycle/session/tool/MCP/file/worktree/fleet owners, deferred tool schemas where `tool_search` expands callable schemas on demand, subagent sidechain transcripts under `.vanta/sidechains`, shell-only OS sandbox mode (`VANTA_SHELL_SANDBOX=1`), and `/verify` deterministic visual close-out requirements, memory guardrails, public LongMemEval/LoCoMo memory recall benchmark runner, parallel worktree fleet command, FABRO declarative workflow graphs behind `compose_workflow`, `/recover` failure-mode triage, auto-research metric improvement loop, meta-tuned `PROGRAM.md` instruction surface, per-task tool scoping, solutioning mode, and the opt-in runtime plugin framework. **terminal-love MCP** wired via `.mcp.json` (12 Terminal Trove design-reference tools as kernel-gated runtime tools). **Resume persistence age-gated**: restart carries prior thread only if recent (`VANTA_RESUME_MAX_AGE_MIN`, default 120; 0 = always clean); Ralph-loop progress in `.vanta/ralph-loop.json` is always surfaced paused until `/goal resume|drop`; `--fork-session` creates a separate seeded session when resuming. **Lifecycle init flags**: `--init`, `--init-only`, `--maintenance` run Setup/SessionStart shell hooks. **All editable TS passes the size gate** (file ≤300 / fn≤50 / params≤4 / cx≤10; only kernel-protected `factory/*` excepted). Current source counts: **88 built-in tools** (90 registered incl. factory `mount_mcp`/`tool_search`) · **99 slash commands**; last recorded full verify: **3711 TS tests** (474 files), `tsc` clean, **53 kernel tests** green. Per-card statuses + notes in `roadmap.json`; full changelog in `vanta-ts/CLAUDE.md` §"Session additions".

**Direction:** `STRATEGY.md` — 5 pillars (**Harness > Operator > Solutioning > Extensibility > Cofounder engine**); external-agent parity is a reference, not a goal (DECISIONS 2026-06-11; 166 cards parked, see PARKED.md). Top open rocks now move past solutioning/plugin v1 into the remaining keyboard, preference, and want-engine slices; build-order export: `node scripts/build-order.mjs`.

**Live-setup caveats** (offline-unit-tested; live needs): browser → `npx playwright install chromium`; anthropic/vision → API keys; comms → provision OAuth client (`VANTA_GOOGLE_CLIENT_ID/SECRET`) + `vanta auth google`; LSP covers .ts/.tsx only; `vanta cron` is OS-scheduler-invoked. See `docs/prd.md`, `DECISIONS.md`, `PARKED.md`.

## Rule zero

No deletes, overwrites, out-of-scope writes, or secret handling without explicit approval. Enforced by the kernel on every tool call.
