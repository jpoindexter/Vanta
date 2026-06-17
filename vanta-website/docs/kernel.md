---
id: kernel
title: The kernel
sidebar_position: 2
---

# The kernel

The kernel (`vanta-kernel`, in `src/`) is the enforced security boundary — small, dependency-free Rust. It owns every decision about whether an action is safe, and the agent layer cannot bypass it.

## Modules

| Module | Purpose |
|--------|---------|
| `app` | `State` (root + data dir), `doctor`, event log, JSON escaping, data-dir migration |
| `safety` | `assess_action() → Verdict{ Allow / Ask / Block }` — the gate |
| `approvals` | `ApprovalQueue`, persisted to `.vanta/approvals.tsv`; only `Ask` actions queue |
| `goals` | `GoalLedger`, persisted to `.vanta/goals.tsv` |
| `runtime` | `run_native()` — safety-gates then dispatches; returns `Unsupported` rather than silently falling back |
| `server` | Raw TCP HTTP/1.1 — the cockpit UI + all `/api/*` JSON endpoints |
| `audit` | Tamper-evident hash chain over `events.jsonl` (per-install secret key) — see [Security](./security.md#tamper-evident-audit-log) |
| `scope` | Path containment (`inside_scope`) + protected-path enforcement — see [Security](./security.md#scope-containment) |
| `loops` | Loop ledger reader/writer (`.vanta/loops/*`): summaries for the cockpit, pause/resume/kill, escalation clearing |

## How `assess()` decides

The classifier runs in a fixed order, and earlier floors are never downgraded:

1. **Block floor** — destructive or exfiltration keywords → `Block`. Runs first, immovable.
2. **Scope check** — paths outside the root → `Ask`.
3. **System / credential keywords** → `Ask`.
4. **Reversibility pass** on the `Allow` tail — irreversible operations (push, migrate, publish, deploy, history rewrite) escalate `Allow → Ask`; read-only and reversible operations (including file writes, which are reversible authoring) stay `Allow`.

See [Safety model](./safety-model.md) for the full tier semantics.

## HTTP API

The kernel listens on `127.0.0.1:7788`:

| Method + path | Purpose |
|---------------|---------|
| `GET /api/status` | Health + counts |
| `POST /api/assess` | Body = action → returns the Verdict |
| `GET\|POST /api/goals` | Read / append goals |
| `GET\|POST /api/approvals` | Read / resolve approvals |
| `POST /api/log` | Append an event |
| `POST /api/run` | Run a gated native action |
| `GET *` | The cockpit HTML UI |

## Data directory

`.vanta/` holds the kernel's durable state:

- `events.jsonl` — the independent decision/event log
- `approvals.tsv` — `id ⇥ text ⇥ risk ⇥ needs_human ⇥ status ⇥ reason`
- `goals.tsv` — `id ⇥ text ⇥ status`

## Running it

```bash
cargo build && cargo test      # build + the kernel test suite
cargo run -- doctor            # health check, creates .vanta/
cargo run -- serve 7788        # cockpit + JSON API
```

The TypeScript launcher auto-starts the kernel when the agent needs it (it passes `VANTA_ROOT` for the active project). If port 7788 is held by a stale binary, find and kill it: `lsof -nP -iTCP:7788 -sTCP:LISTEN`.
