# Vanta

A local trusted-operator agent runtime. The agent that knows the goal, knows the boundary, acts verified.

Goal-aware, boundary-enforced operation with visible decisions before action.

Two layers:
- **`src/` — Rust safety kernel** (`vanta-kernel`): the enforced security boundary — risk classifier, approval queue, goal ledger, event log, HTTP sidecar.
- **`vanta-ts/` — TypeScript agent layer** (`vanta`): the agent loop — LLM providers, tools, three-tier prompt, goal-aware execution that gates every action through the kernel.

See `docs/prd.md` for the full roadmap.

## Install

One command on a fresh machine — clones Vanta into `~/vanta`, builds the kernel, and puts a global `vanta` on your PATH:

```bash
curl -fsSL https://raw.githubusercontent.com/jpoindexter/Vanta/main/bootstrap.sh | bash
```

> The curl one-liner works once the repo is public. While it's private, clone with your GitHub auth and run `./install.sh` (or `bash bootstrap.sh` locally). Override the location with `VANTA_DIR=/path bash bootstrap.sh`. Prereqs: git, Rust, Node 22.

Then: `vanta setup` (pick a model backend) → `vanta` (interactive session) → `vanta doctor` (health check).

## Quickstart

```bash
./run.sh run "read README.md and summarize it"
```

First run builds the Rust kernel and installs agent deps (once); after that it's instant. The kernel auto-starts when the agent needs it. Provider defaults to local **Ollama** (`qwen2.5:14b`, no API key) — make sure Ollama is running. Edit `vanta-ts/.env` to switch to OpenAI/Anthropic.

```bash
./run.sh                                   # list all commands
./run.sh run "<instruction>"               # the agent loop
./run.sh --init-only                       # run Setup + SessionStart hooks, then exit
./run.sh resume <id> --fork-session        # resume history into a new session id
./run.sh skills | skill <name> ["<instr>"] # learned skills
./run.sh modes install                     # the 6 operator modes
./run.sh rooms | room <name> "<instr>"     # per-project goal streams
./run.sh goals                             # kernel goals plus dependency graph state
./run.sh schedule "<instr>" --cron "0 8 * * *" | schedule list | cron
./run.sh auth google                       # one-time Google OAuth (gmail/calendar/drive)
```

(`./vanta` is an alias for `./run.sh`. Prereqs: Rust + Node 22.)

## What works now

**Kernel (Rust):** enforced risk classifier (allow/ask/block), approval queue, goal ledger, event log, HTTP cockpit + JSON API, `VANTA_ROOT` scoping.

**Agent (TypeScript):**
- Core loop: goal-inject → plan → assess → execute → verify; OpenAI/Ollama/Anthropic/Gemini/OpenRouter providers; 90 registered tools and 99 slash commands
- **Goals** — kernel goal ledger plus TS dependency graph (`/goal blocks`, `/goal blocked_by`, `vanta goals`)
- **Skills & memory** — learned `~/.vanta/skills`, per-goal memory, curator, LLM context compression (git-versioned)
- **Web search** — DuckDuckGo/Searxng/SerpAPI/Brave + `web_fetch` (readable extraction)
- **Browser & vision** — screenshot / navigate / extract / read / act (Playwright) + image/video understanding
- **Code & dev** — scoped file editing, grep/glob, `run_code`, LSP diagnostics/definition (TS), git tools, regression locks
- **Autonomous** — cron scheduler, background tasks, subagent delegation, swarm/workflow, A2A bus, team workers
- **Parallel work** — `vanta fleet run/status/review/accept` fans independent tasks into isolated worktrees for review
- **Auto-research** — `vanta auto-research --objective --metric --bounds` runs an unattended metric loop and keeps only improving candidate commits
- **Meta-tune** — `vanta meta-tune instructions` scores bounded `PROGRAM.md` variants against evals and requires approval before adoption
- **Operator systems** — world model, Money OS, opportunity radar, life-wide search, self-repair compartments, reach doctor
- **Digital person** — project rooms, operator modes, model routing, mode learning, brain/memory layers
- **Benchmarks** — deterministic memory recall evals, including public LongMemEval/LoCoMo via `vanta eval mem public`
- **Session lifecycle** — `/init`, `.vanta/hooks.json` hooks (`command`, `http`, `mcp_tool`, `prompt`, `agent`) with the 30-event schema in progress, `--init`/`--init-only`/`--maintenance`, resume `--fork-session`
- **Comms** — Gmail / Calendar / Drive (every outbound approval-gated)

Some capabilities need one-time setup for *live* use (browser binaries, API keys, Google OAuth client, login cookies for gated reach channels) — see `PARKED.md`. Tests: `cargo test` (kernel) · `cd vanta-ts && npm test` (agent).

## Related

- **[obsidian-vault-mcp](https://github.com/jpoindexter/obsidian-vault-mcp)** — MCP server that gives Vanta (or any MCP client) a self-improving Obsidian knowledge base. 10 tools: read, keyword + semantic search, full self-ingest, hot cache. Zero dependencies, local ollama embeddings.

## Rule zero

Do no harm. No deletes, no overwrites, no touching outside authorized scope without explicit approval. The Rust kernel enforces this on every tool call — it is a gate, not a suggestion.
