# Argo

A local trusted-operator agent runtime. The agent that knows the goal, knows the boundary, acts verified.

OpenClaw gave agents a body. Hermes gave agents a personal runtime. Argo starts the next layer: goal-aware, boundary-enforced operation with visible decisions before action.

Two layers:
- **`src/` — Rust safety kernel** (`argo-kernel`): the enforced security boundary — risk classifier, approval queue, goal ledger, event log, HTTP sidecar.
- **`argo-ts/` — TypeScript agent layer** (`argo`): the agent loop — LLM providers, tools, three-tier prompt, goal-aware execution that gates every action through the kernel.

See `docs/prd.md` for the full roadmap and `docs/hermes-map.html` for the Hermes architecture reference.

## What works now (Phase 1)

**Kernel (Rust):**
- Action risk classifier (allow / ask / block) — the enforced boundary, not advisory
- Native approval queue (`.argo/approvals.tsv`), goal ledger (`.argo/goals.tsv`), event log (`.argo/events.jsonl`)
- Local HTTP cockpit + JSON API; `ARGO_ROOT` env override for explicit project scoping

**Agent (TypeScript):**
- Agent loop: goal-inject → plan → assess → execute → verify
- LLM providers: OpenAI + Ollama (one adapter, baseURL swap); Anthropic arrives in Phase 4
- Tools: `read_file`, `write_file` (overwrite needs approval), `shell_cmd`, `inspect_state` — all scope-checked and kernel-gated
- Three-tier system prompt (SOUL.md + ARGO/AGENTS/CLAUDE.md discovery + active goals)
- Context trimmer, kernel auto-start, pause-on-ask approval

## Run the kernel

```bash
cargo build
cargo run -- doctor          # health check, creates .argo/
cargo run -- goals add "Ship Argo v0 agent loop"
cargo run -- serve 7788      # cockpit at http://127.0.0.1:7788
```

## Run the agent

```bash
cd argo-ts
npm install
cp .env.example .env         # defaults to local Ollama (qwen2.5:14b)

# the kernel auto-starts if not already running
npm run argo -- run "what are my active goals"
npm run argo -- run "read README.md and summarize"

# use OpenAI instead of local models:
#   set ARGO_PROVIDER=openai, ARGO_MODEL=gpt-4o-mini, OPENAI_API_KEY in .env
```

Tests: `cargo test` (kernel) and `cd argo-ts && npm test` (agent).

## Rule zero

Do no harm. No deletes, no overwrites, no touching outside authorized scope without explicit approval. The Rust kernel enforces this on every tool call — it is a gate, not a suggestion.
