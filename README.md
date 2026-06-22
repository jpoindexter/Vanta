# Vanta

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md) [![Docs](https://img.shields.io/badge/docs-vanta.theft.studio-6d28d9.svg)](https://docs.vanta.theft.studio)

A local trusted-operator agent runtime. The agent that knows the goal, knows the boundary, acts verified.

Goal-aware, boundary-enforced operation with visible decisions before action.

Two layers:
- **`src/` — Rust safety kernel** (`vanta-kernel`): the enforced security boundary — risk classifier, approval queue, goal ledger, event log, HTTP sidecar.
- **`vanta-ts/` — TypeScript agent layer** (`vanta`): the agent loop — LLM providers, tools, three-tier prompt, goal-aware execution that gates every action through the kernel.

See `docs/prd.md` for the full roadmap.

## Install

One command on a fresh machine — clones Vanta into `~/vanta`, downloads the prebuilt kernel (and a portable Node if you don't have one), and puts a global `vanta` on your PATH:

```bash
curl -fsSL https://raw.githubusercontent.com/jpoindexter/Vanta/main/bootstrap.sh | bash
```

> **Only `git` is required.** No Rust toolchain, no system Node — `install.sh` downloads a checksum-verified prebuilt kernel (from the GitHub release) and a portable **Node 22** (from nodejs.org) when they're missing. Already have Rust + Node? It uses them. Override the location with `VANTA_DIR=/path bash bootstrap.sh`.

Then: `vanta setup` (pick a model backend) → `vanta` (interactive session) → `vanta doctor` (health check).

## Quickstart

```bash
./run.sh run "read README.md and summarize it"
```

First run downloads the prebuilt kernel (and a portable Node if needed) and installs agent deps once; after that it's instant. The kernel auto-starts when the agent needs it. Provider defaults to local **Ollama** (`qwen2.5:14b`, no API key) — make sure Ollama is running. Edit `vanta-ts/.env` to switch to OpenAI/Anthropic.

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

(`./vanta` is an alias for `./run.sh`. Only `git` is needed — the kernel and Node are fetched automatically.)

## What works now

**Kernel (Rust):** enforced risk classifier (allow/ask/block), approval queue, goal ledger, event log, HTTP cockpit + JSON API, `VANTA_ROOT` scoping.

**Agent (TypeScript):**
- Core loop: goal-inject → plan → assess → execute → verify; OpenAI/Ollama/Anthropic/Gemini/OpenRouter providers; 122 registered tools and 125 slash commands
- **Goals** — kernel goal ledger plus TS dependency graph (`/goal blocks`, `/goal blocked_by`, `vanta goals`)
- **Skills & memory** — learned `~/.vanta/skills`, per-goal memory, curator, LLM context compression (git-versioned)
- **Web search** — DuckDuckGo/Searxng/SerpAPI/Brave + `web_fetch` (readable extraction)
- **Browser & vision** — screenshot / navigate / extract / read / act (Playwright) + image/video understanding
- **Voice & terminal** — push-to-talk voice input (local whisper STT), live terminal capture (tmux-backed), Slack `#channel` autocomplete in the composer
- **Desktop control** — native screen control (screencapture → vision grounding → cliclick, or the CHICAGO computer-use MCP); `vanta control setup` grants OS permissions
- **Personal tuning** — `vanta tune lora` trains a local LoRA adapter from your accepted/rejected operator decisions (real MPS/CUDA/CPU training)
- **Code & dev** — scoped file editing, grep/glob, `run_code`, LSP diagnostics/definition (TS), git tools, regression locks
- **Autonomous** — cron scheduler, background tasks, subagent delegation, swarm/workflow, A2A bus, team workers
- **Parallel work** — `vanta fleet run/status/review/accept` fans independent tasks into isolated worktrees for review; `vanta fleet tmux` runs a live one-pane-per-task tmux swarm
- **Auto-research** — `vanta auto-research --objective --metric --bounds` runs an unattended metric loop and keeps only improving candidate commits
- **Meta-tune** — `vanta meta-tune instructions` scores bounded `PROGRAM.md` variants against evals and requires approval before adoption
- **Operator systems** — world model, Money OS, opportunity radar, life-wide search, self-repair compartments, reach doctor
- **Digital person** — project rooms, operator modes, model routing, mode learning, brain/memory layers
- **Benchmarks** — deterministic memory recall evals, including public LongMemEval/LoCoMo via `vanta eval mem public`
- **Session lifecycle** — `/init`, `.vanta/hooks.json` hooks (`command`, `http`, `mcp_tool`, `prompt`, `agent`) with a 30-event schema, `--init`/`--init-only`/`--maintenance`, resume `--fork-session`
- **Comms** — Gmail / Calendar / Drive (every outbound approval-gated)

Some capabilities need one-time setup for *live* use (browser binaries, API keys, Google OAuth client, login cookies for gated reach channels) — see `PARKED.md`. Tests: `cargo test` (kernel) · `cd vanta-ts && npm test` (agent).

## Run anywhere you control

Vanta is not laptop-bound — it runs on any host you control and the **kernel travels with it**, gating every action wherever it runs (no vendor lock-in, your data residency). Pick the execution backend in `vanta setup` → **Execution backend** (local · sandbox · docker · ssh):

- **Local** — the default.
- **Sandbox** — `VANTA_SANDBOX=1` (or shell-only `VANTA_SHELL_SANDBOX=1`) wraps shell + `run_code` in the OS sandbox; `VANTA_SANDBOX_NET=1` allows network.
- **Docker** — `VANTA_EXEC_BACKEND=docker` runs shell + `run_code` inside a container (mounts the project root + writable zones + tmp only, `--network none` unless `VANTA_SANDBOX_NET=1`; `VANTA_DOCKER_IMAGE` overrides the image). Out-of-container writes don't persist.
- **SSH** — name a host you control in `settings.sshConfigs`, then `shell_cmd {ssh:"<name>", command}` runs it on that host (the kernel still assesses every command) and `vanta ssh <name>` opens an interactive session.

### The $5 VPS path

1. Rent the cheapest VPS your provider offers (1 vCPU / 1 GB is plenty for the kernel + agent loop).
2. Install Vanta on it (`./install.sh`) — the kernel binds `127.0.0.1:7788` on that box.
3. `vanta setup` → pick a model backend + the **Execution backend**, then export your provider key.
4. Run `vanta` (or `vanta run "..."`) on the VPS. The kernel enforces scope there exactly as on your laptop — `VANTA_ROOT` bounds the writable tree and every tool call is gated by `assess()`.

Prefer to keep the agent on your laptop but execute on the VPS? Add an `sshConfigs` profile and use the **ssh** backend — the loop runs locally, commands run on the host you control. (Serverless / hibernate-when-idle is a later, data-residency-gated child — `roadmap.json` `BACKEND-SERVERLESS`.)

## Why Vanta

- **Enforced boundary** — a separate Rust kernel risk-classifies every action (allow/ask/block + scope + tamper-evident audit chain); the agent loop can't bypass it, and execution runs in an OS sandbox / Docker / SSH.
- **Goal-aware** — a goal ledger + dependency graph mean Vanta knows the goal before it picks a tool.
- **ND-first** — executive-function support baked in: task initiation (smallest next step), choice reduction (top 3), working-memory re-anchoring, closure gates, time-blindness ranges, low-sensory output.
- **Learns you, locally** — `vanta tune lora` trains a local adapter from your own accept/reject decisions; nothing leaves the machine.
- **20 messaging channels** from one gateway (Telegram, Slack, Discord, Signal, WhatsApp, iMessage, Teams, Email, Nostr…), 5 live-verified.
- **Any model, any host** — provider-agnostic (any OpenAI-compatible endpoint + Azure/Bedrock/OpenRouter/Ollama); runs local / sandbox / Docker / SSH / $5 VPS, kernel-scoped everywhere.
- **MIT + self-hosted** — your data residency, no vendor lock-in.

More → **[Why Vanta](https://docs.vanta.theft.studio/why-vanta)**.

## Related

- **[obsidian-vault-mcp](https://github.com/jpoindexter/obsidian-vault-mcp)** — MCP server that gives Vanta (or any MCP client) a self-improving Obsidian knowledge base. 10 tools: read, keyword + semantic search, full self-ingest, hot cache. Zero dependencies, local ollama embeddings.

## Rule zero

Do no harm. No deletes, no overwrites, no touching outside authorized scope without explicit approval. The Rust kernel enforces this on every tool call — it is a gate, not a suggestion.

## Contributing

Issues and PRs welcome — see **[CONTRIBUTING.md](CONTRIBUTING.md)** for setup, the code standards (size gate, ESM, zod boundaries), and how to run the suite. We follow a [Code of Conduct](CODE_OF_CONDUCT.md). Found a vulnerability? See [SECURITY.md](SECURITY.md) — please report privately, not in a public issue.

## License

[MIT](LICENSE) © Jason Poindexter.
