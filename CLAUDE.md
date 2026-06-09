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
cargo build && cargo test                 # 16 tests
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
| `safety` | `assess_action() → Verdict{Risk::Allow/Ask/Block}`. Keyword blocklist (destructive/exfiltration=Block), scope check (outside root=Ask), system/credential keywords=Ask, else Allow |
| `approvals` | `ApprovalQueue`, persisted `.vanta/approvals.tsv`. Only `Ask` actions queue; `Block` errors, `Allow` errors |
| `goals` | `GoalLedger`, `.vanta/goals.tsv` |
| `runtime` | `run_native()` — safety-gates then dispatches; returns `Unsupported` rather than silently falling back |
| `bridge` | Legacy CLI bridge; `plan_prompt()` gates before building an external command (legacy, not core) |
| `server` | Raw TCP HTTP/1.1; inlined cockpit HTML const; all `/api/*` return JSON |

**Kernel API** (`127.0.0.1:7788`): `GET /api/status`, `POST /api/assess` (body=action→Verdict), `GET|POST /api/goals`, `GET|POST /api/approvals`, `POST /api/log` (body=event), `POST /api/run`, `POST /api/bridge/plan`, `GET *`→cockpit.

**Data dir** `.vanta/`: `events.jsonl`, `approvals.tsv` (`id\ttext\trisk\tneeds_human\tstatus\treason`), `goals.tsv` (`id\ttext\tstatus`).

## Gotchas (will waste your time if you don't know)

- **`VANTA_ROOT` env var** overrides the kernel's cwd-based root. Set it when launching the kernel for a specific project. The TS launcher always passes it.
- **Stale kernel binary** may hold port 7788 from a previous build. If a new kernel won't bind, `lsof -nP -iTCP:7788 -sTCP:LISTEN` and kill the PID.
- Kernel must be reachable before the agent runs (launcher auto-starts it; needs `target/debug/vanta-kernel` built).

## Status

**v1 complete; roadmap-grind in progress.** Full v1 feature parity + Phase 2 EF + all S/M/L extensions. **47 tools** · **27 Rust tests** · **TS tests in `npm test`** (all green). Per-card statuses + notes in `roadmap.json`; full session changelog in `vanta-ts/CLAUDE.md` §"Session additions".

**Open (roadmap.json `next`):** `EF-TASKSTACK` · `MEM-RELEVANCE` · `OPERATOR-DASHBOARD` · `VISION-COMPARE` · `AUX-MAP` · `AUTO-ROUTER`. Gated on Jason: `SCRUB-AI` · `VOICE-NATURAL`. Horizon: `DESKTOP` (Tauri).

**Live-setup caveats** (offline-unit-tested; live needs): browser → `npx playwright install chromium`; anthropic/vision → API keys; comms → provision OAuth client (`VANTA_GOOGLE_CLIENT_ID/SECRET`) + `vanta auth google`; LSP covers .ts/.tsx only; `vanta cron` is OS-scheduler-invoked. See `docs/prd.md`, `DECISIONS.md`, `PARKED.md`.

## Rule zero

No deletes, overwrites, out-of-scope writes, or secret handling without explicit approval. Enforced by the kernel on every tool call.
