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

# Agent (TypeScript) — from argo-ts/
npm install
npm run argo -- run "<instruction>"       # kernel auto-starts if down
npm test                                  # 22 vitest tests
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

Phases 1, 2A, 2B **done**. 2B: web search (`SearchProvider` ddg/searxng/serpapi/brave + `web_search`/`web_fetch`; `web_fetch` verified live, DDG IP-blocked here). 2A: skills (`~/.argo/skills/<slug>/SKILL.md`, `write_skill`/`recall`, curator), per-goal memory (`~/.argo/memories/`) injected into the prompt, LLM context compression, `argo skills`/`skill` subcommands — git-versioning verified live. **97 TS + 16 Rust tests green.** Next: Phases 3 (browser/vision), 4 (code/dev), 6 (autonomous) — building in parallel; 5 (comms, needs MCP-access decision) and 7 (digital person) after. See `docs/prd.md`, `DECISIONS.md`.

## Rule zero

No deletes, overwrites, out-of-scope writes, or secret handling without explicit approval. Enforced by the kernel on every tool call.
