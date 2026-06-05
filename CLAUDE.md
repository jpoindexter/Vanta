# CLAUDE.md — Argo (repo root)

Read this first. Global `~/.claude/CLAUDE.md` conventions apply; only Argo-specific facts are here. Don't re-derive what's below — it's the source of truth.

## What Argo is

A local trusted-operator agent: knows the goal before it picks a tool, enforces scope on every action, reports only verified output. Lineage: OpenClaw → Hermes → Argo. Full vision + roadmap in `docs/prd.md`. Hermes architecture reference (what to steal/improve/replace) in `docs/hermes-map.html`.

## Two layers

| Path | Layer | Language | Role |
|------|-------|----------|------|
| `src/` | `argo-kernel` | Rust, zero deps | **Enforced** security boundary: risk classifier, approvals, goals, events, HTTP sidecar |
| `argo-ts/` | `argo` | TypeScript, Node 22 | Agent loop: LLM providers, tools, 3-tier prompt. Gates every action through the kernel |

The kernel is the boundary — `assess()` is a gate, not a suggestion. The TS layer orchestrates; it cannot bypass the kernel. Deep agent-layer docs: `argo-ts/CLAUDE.md`.

## Commands

```bash
# Kernel (Rust)
cargo build && cargo test                 # 16 tests
cargo run -- doctor                       # health check, creates .argo/
cargo run -- goals add "..."              # seed a goal
cargo run -- serve 7788                   # cockpit + JSON API

# Install the global `argo` command (Hermes/OpenClaw-style: ~/.local/bin launcher + ~/.argo seed)
./install.sh                               # then `argo` works from anywhere (no profile edit if ~/.local/bin is on PATH)

# Agent — from repo root (preferred): self-bootstrapping launcher
./run.sh                                   # interactive session (runs first-run setup wizard if unconfigured)
./run.sh setup                             # pick a model backend: openai | gemini | anthropic | openrouter | ollama
./run.sh doctor                            # agent-side health: kernel ping, provider, key presence, store, goals
./run.sh run "<instruction>"              # or ./argo run "..." ; one-shot, kernel auto-starts
./run.sh help                              # list all subcommands

# Agent (TypeScript) — from argo-ts/ (direct)
npm install
npm run argo                              # interactive session (no args)
npm run argo -- run "<instruction>"       # one-shot; kernel auto-starts if down
npm test                                  # 274 vitest tests
npm run typecheck                         # tsc --noEmit (must be clean)
```

## Kernel module map (`src/`)

| Module | Purpose |
|--------|---------|
| `app` | `State` (root + data_dir), `doctor`, `append_event`/`log_event`, `esc()` JSON escaper, `.nexarion→.argo` migration |
| `safety` | `assess_action() → Verdict{Risk::Allow/Ask/Block}`. Keyword blocklist (destructive/exfiltration=Block), scope check (outside root=Ask), system/credential keywords=Ask, else Allow |
| `approvals` | `ApprovalQueue`, persisted `.argo/approvals.tsv`. Only `Ask` actions queue; `Block` errors, `Allow` errors |
| `goals` | `GoalLedger`, `.argo/goals.tsv` |
| `runtime` | `run_native()` — safety-gates then dispatches; returns `Unsupported` rather than silently falling back |
| `bridge` | Detects Hermes CLI; `plan_prompt()` gates before building a hermes command (legacy, not core) |
| `server` | Raw TCP HTTP/1.1; inlined cockpit HTML const; all `/api/*` return JSON |

**Kernel API** (`127.0.0.1:7788`): `GET /api/status`, `POST /api/assess` (body=action→Verdict), `GET|POST /api/goals`, `GET|POST /api/approvals`, `POST /api/log` (body=event), `POST /api/run`, `POST /api/bridge/plan`, `GET *`→cockpit.

**Data dir** `.argo/`: `events.jsonl`, `approvals.tsv` (`id\ttext\trisk\tneeds_human\tstatus\treason`), `goals.tsv` (`id\ttext\tstatus`).

## Gotchas (will waste your time if you don't know)

- **`ARGO_ROOT` env var** overrides the kernel's cwd-based root. Set it when launching the kernel for a specific project. The TS launcher always passes it.
- **Stale `nexarion-agent` binary** may hold port 7788 from before the rename. If a new kernel won't bind, `lsof -nP -iTCP:7788 -sTCP:LISTEN` and kill the PID.
- **A leftover empty `../Nexarion Agent/` dir** exists (harness artifact, only an empty `.claude/`). The real repo is `Argo/`. Don't work in the old path.
- Kernel must be reachable before the agent runs (launcher auto-starts it; needs `target/debug/argo-kernel` built).

## Status

**v1 complete; new dogfooding backlog opened 2026-06-05.** Full v1 Hermes parity + Phase 2 EF + all S/M/L roadmap extensions. **45 tools** (+ compose_workflow + graph_query) · **1067 TS + 27 Rust = 1094 tests green.**

**In flight (2026-06-05 — from live use):** shipped — TUI readability (full-width, slash palette 8-cap + column layout, `/skills` + skill-index clipping) and **AUX-VISION** (image tools route to a dedicated `ARGO_VISION_MODEL` so a text-only main model doesn't break sight). Open in `roadmap.json` (`next`): `AUX-MAP` (per-function aux-task model map) · `UX-MODEL-FIX` (model-persistence regression — `/model` choice not sticking) · `GOAL-ACTION` (auto vague-goal→next-step) · `SCRUB-AI` (strip Hermes/Claude/other-agent mentions from published code, keep research docs). `horizon`: `DESKTOP` (Tauri app).

Key capabilities added this session: TUI (help overlay, themes, vim mode, shortcuts, thinking display), EF Phase 3 (scope-delta, wm-manip), Memory (verbatim archive, compression, working memory, versioning, graph, 5D/12-axis brain), Factory (preflight, escalation, holdout, stall recovery, auto-close), Platform (voice loop, checkpoints, user commands), Brain (salience+executive networks, v2 scaffold), Infrastructure (canonical project ID, worktree detection, Claude Code hooks, typed stream events).

Live-setup caveats (real code, offline-unit-tested; live use needs external setup): browser → `npx playwright install chromium`; anthropic/vision → API keys; comms → provision an OAuth client (`ARGO_GOOGLE_CLIENT_ID/SECRET`, one-time) + `argo auth google`; LSP .ts/.tsx only; `argo cron` is OS-scheduler-invoked. See `docs/prd.md`, `DECISIONS.md`. Post-MVP polish in `PARKED.md`.

## Rule zero

No deletes, overwrites, out-of-scope writes, or secret handling without explicit approval. Enforced by the kernel on every tool call.
