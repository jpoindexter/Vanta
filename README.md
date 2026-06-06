# Vanta

A local trusted-operator agent runtime. The agent that knows the goal, knows the boundary, acts verified.

OpenClaw gave agents a body. Hermes gave agents a personal runtime. Vanta starts the next layer: goal-aware, boundary-enforced operation with visible decisions before action.

Two layers:
- **`src/` — Rust safety kernel** (`argo-kernel`): the enforced security boundary — risk classifier, approval queue, goal ledger, event log, HTTP sidecar.
- **`argo-ts/` — TypeScript agent layer** (`argo`): the agent loop — LLM providers, tools, three-tier prompt, goal-aware execution that gates every action through the kernel.

See `docs/prd.md` for the full roadmap and `docs/hermes-map.html` for the Hermes architecture reference.

## Install

One command on a fresh machine — clones Vanta into `~/argo`, builds the kernel, and puts a global `argo` on your PATH:

```bash
curl -fsSL https://raw.githubusercontent.com/jpoindexter/Vanta/main/bootstrap.sh | bash
```

> The curl one-liner works once the repo is public. While it's private, clone with your GitHub auth and run `./install.sh` (or `bash bootstrap.sh` locally). Override the location with `VANTA_DIR=/path bash bootstrap.sh`. Prereqs: git, Rust, Node 22.

Then: `argo setup` (pick a model backend) → `argo` (interactive session) → `argo doctor` (health check).

## Quickstart

```bash
./run.sh run "read README.md and summarize it"
```

First run builds the Rust kernel and installs agent deps (once); after that it's instant. The kernel auto-starts when the agent needs it. Provider defaults to local **Ollama** (`qwen2.5:14b`, no API key) — make sure Ollama is running. Edit `argo-ts/.env` to switch to OpenAI/Anthropic.

```bash
./run.sh                                   # list all commands
./run.sh run "<instruction>"               # the agent loop
./run.sh skills | skill <name> ["<instr>"] # learned skills
./run.sh modes install                     # the 6 operator modes
./run.sh rooms | room <name> "<instr>"     # per-project goal streams
./run.sh schedule "<instr>" --cron "0 8 * * *" | schedule list | cron
./run.sh auth google                       # one-time Google OAuth (gmail/calendar/drive)
```

(`./argo` is an alias for `./run.sh`. Prereqs: Rust + Node 22.)

## What works now (all 7 PRD phases — 32 tools, 290 tests green)

**Kernel (Rust):** enforced risk classifier (allow/ask/block), approval queue, goal ledger, event log, HTTP cockpit + JSON API, `VANTA_ROOT` scoping.

**Agent (TypeScript):**
- Core loop: goal-inject → plan → assess → execute → verify; OpenAI/Ollama/Anthropic providers; 4 core tools (read/write/shell/inspect)
- **Skills & memory** — learned `~/.vanta/skills`, per-goal memory, curator, LLM context compression (git-versioned)
- **Web search** — DuckDuckGo/Searxng/SerpAPI/Brave + `web_fetch` (readable extraction)
- **Browser & vision** — screenshot / navigate / extract (Playwright) + image understanding
- **Code & dev** — `run_code`, LSP diagnostics/definition (TS), git tools
- **Autonomous** — cron scheduler, subagent delegation, A2A bus
- **Digital person** — project rooms, operator modes, model routing, mode learning
- **Comms** — Gmail / Calendar / Drive (every outbound approval-gated)

Some capabilities need one-time setup for *live* use (browser binaries, API keys, Google OAuth client) — see `PARKED.md`. Tests: `cargo test` (kernel) · `cd argo-ts && npm test` (agent).

## Rule zero

Do no harm. No deletes, no overwrites, no touching outside authorized scope without explicit approval. The Rust kernel enforces this on every tool call — it is a gate, not a suggestion.
