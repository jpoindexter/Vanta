# CLAUDE.md — Vanta (repo root)

Read this first. Global `~/.claude/CLAUDE.md` conventions apply; only Vanta-specific facts are here. Don't re-derive what's below — it's the source of truth.

## What Vanta is

A local trusted-operator agent: knows the goal before it picks a tool, enforces scope on every action, reports only verified output. Lineage: OpenClaw → Hermes → Vanta. Full vision + roadmap in `docs/prd.md`. Hermes architecture reference (what to steal/improve/replace) in `docs/hermes-map.html`.

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

# Install the global `vanta` command (Hermes/OpenClaw-style: ~/.local/bin launcher + ~/.vanta seed)
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
npm test                                  # 274 vitest tests
npm run typecheck                         # tsc --noEmit (must be clean)
```

## Kernel module map (`src/`)

| Module | Purpose |
|--------|---------|
| `app` | `State` (root + data_dir), `doctor`, `append_event`/`log_event`, `esc()` JSON escaper, `.nexarion→.vanta` migration |
| `safety` | `assess_action() → Verdict{Risk::Allow/Ask/Block}`. Keyword blocklist (destructive/exfiltration=Block), scope check (outside root=Ask), system/credential keywords=Ask, else Allow |
| `approvals` | `ApprovalQueue`, persisted `.vanta/approvals.tsv`. Only `Ask` actions queue; `Block` errors, `Allow` errors |
| `goals` | `GoalLedger`, `.vanta/goals.tsv` |
| `runtime` | `run_native()` — safety-gates then dispatches; returns `Unsupported` rather than silently falling back |
| `bridge` | Detects Hermes CLI; `plan_prompt()` gates before building a hermes command (legacy, not core) |
| `server` | Raw TCP HTTP/1.1; inlined cockpit HTML const; all `/api/*` return JSON |

**Kernel API** (`127.0.0.1:7788`): `GET /api/status`, `POST /api/assess` (body=action→Verdict), `GET|POST /api/goals`, `GET|POST /api/approvals`, `POST /api/log` (body=event), `POST /api/run`, `POST /api/bridge/plan`, `GET *`→cockpit.

**Data dir** `.vanta/`: `events.jsonl`, `approvals.tsv` (`id\ttext\trisk\tneeds_human\tstatus\treason`), `goals.tsv` (`id\ttext\tstatus`).

## Gotchas (will waste your time if you don't know)

- **`VANTA_ROOT` env var** overrides the kernel's cwd-based root. Set it when launching the kernel for a specific project. The TS launcher always passes it.
- **Stale `nexarion-agent` binary** may hold port 7788 from before the rename. If a new kernel won't bind, `lsof -nP -iTCP:7788 -sTCP:LISTEN` and kill the PID.
- **A leftover empty `../Nexarion Agent/` dir** exists (harness artifact, only an empty `.claude/`). The real repo is `Vanta/`. Don't work in the old path.
- Kernel must be reachable before the agent runs (launcher auto-starts it; needs `target/debug/vanta-kernel` built).

## Status

**v1 complete; roadmap-grind in progress (2026-06-07).** Full v1 Hermes parity + Phase 2 EF + all S/M/L roadmap extensions. **46 tools** (+ compose_workflow + graph_query + roadmap_add) · **1216 TS + 27 Rust = 1243 tests green.** New ops: `vanta lint` (code-size gate) · `vanta open file:line`.

**Shipped 2026-06-07 (18 cards — per-card notes + statuses in `roadmap.json`; module detail in `vanta-ts/CLAUDE.md` §"Session additions (2026-06-07)"):** UX-MODEL-FIX (legacy `ARGO_*` env strip — root cause of "stuck on codex"; `/model <arg>` hot-swap+persist) · RESTART (`/restart` exit-75 + run.sh relaunch loop) · TOOL-RETRY (safe retry of idempotent reads) · GOAL-ACTION (vague goal auto-fires `/next`) · STALL-UNBLOCK · AUTO-HANDOFF (auto resume block on context pressure + reload on launch — the top net-new continuity want) · COST-VISIBLE (per-turn cost/latency + session split) · MODE-DETECT · ROADMAP-ADD (`roadmap_add` tool) · BUG-CAPTURE (`/bug`) · HANDOFF-PACKET (`/handoff`) · ACTION-PROOF (write_file re-read verify) · BEHAVIOR-VOICE (prompt rule 10) + REF-FIDELITY/VERIFY-RIGHT/BETTER-ENDINGS/TRUST-LABELS folded into rules 1/4/7 · CODE-SIZE-GATE (`vanta lint` + warn-only pre-commit + in-`write_file` self-check) · CC-EDITOR (`vanta open`/`/open`).

**Still open in `roadmap.json` (`next`):** the bigger Rocks — `EF-TASKSTACK` · `MEM-RELEVANCE` · `OPERATOR-DASHBOARD` · `VISION-COMPARE` — plus `AUX-MAP`/`AUTO-ROUTER` and a long S/M tail. **Gated on Jason:** `SCRUB-AI` (force-push history rewrite) · `VOICE-NATURAL` (3-sample approval). `horizon`: `DESKTOP` (Tauri app).

Key capabilities added this session: TUI (help overlay, themes, vim mode, shortcuts, thinking display), EF Phase 3 (scope-delta, wm-manip), Memory (verbatim archive, compression, working memory, versioning, graph, 5D/12-axis brain), Factory (preflight, escalation, holdout, stall recovery, auto-close), Platform (voice loop, checkpoints, user commands), Brain (salience+executive networks, v2 scaffold), Infrastructure (canonical project ID, worktree detection, Claude Code hooks, typed stream events).

Live-setup caveats (real code, offline-unit-tested; live use needs external setup): browser → `npx playwright install chromium`; anthropic/vision → API keys; comms → provision an OAuth client (`VANTA_GOOGLE_CLIENT_ID/SECRET`, one-time) + `vanta auth google`; LSP .ts/.tsx only; `vanta cron` is OS-scheduler-invoked. See `docs/prd.md`, `DECISIONS.md`. Post-MVP polish in `PARKED.md`.

## Rule zero

No deletes, overwrites, out-of-scope writes, or secret handling without explicit approval. Enforced by the kernel on every tool call.
