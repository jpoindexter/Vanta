# Vanta

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md) [![Docs](https://img.shields.io/badge/docs-vanta.theft.studio-6d28d9.svg)](https://docs.vanta.theft.studio)

<p align="center">
  <img src="assets/vanta-demo.gif" alt="Vanta TUI: a goal in, a kernel-gated shell tool call, a verified answer out" width="820">
</p>

A local trusted-operator agent runtime. The agent that knows the goal, knows the boundary, acts verified.

Goal-aware, boundary-enforced operation with visible decisions before action.

Two layers:
- **`src/` — Rust safety kernel** (`vanta-kernel`): the enforced security boundary — risk classifier, approval queue, goal ledger, event log, HTTP sidecar.
- **`vanta-ts/` — TypeScript agent layer** (`vanta`): the agent loop — LLM providers, tools, three-tier prompt, goal-aware execution that gates every action through the kernel.

See `docs/prd.md` for the full roadmap.

## Install

On macOS or Linux, one command clones Vanta into `~/vanta`, downloads the prebuilt kernel (and a portable Node if you don't have one), and puts a global `vanta` on your PATH:

```bash
curl -fsSL https://vanta.theft.studio/install.sh | bash
```

> **Only `git` is required.** No Rust toolchain, no system Node — `install.sh` downloads a checksum-verified prebuilt kernel (from the GitHub release) and a portable **Node 22** (from nodejs.org) when they're missing. Already have Rust + Node? It uses them. Override the location with `VANTA_DIR=/path bash bootstrap.sh`.

On Windows 11, clone the repository and run the tracked PowerShell installer:

```powershell
git clone https://github.com/jpoindexter/Vanta.git
cd Vanta
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

The current Windows installer uses `winget` for missing Git, Node 22, and Rust. It downloads the checksum-verified x64 kernel when available and falls back to a native Cargo build. Native Windows service supervision is not shipped yet; run the gateway in the foreground.

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

## What you can build

Vanta is a **general operator**, not a coding tool — one agent runs every category of work, gated by the kernel:

- **Scheduled ops** — *"every weekday 9am, summarize my inbox and post to Slack"* (`vanta schedule`, natural-language cron).
- **Self-improving skills** — it writes a reusable `SKILL.md` after solving something hard, then it's faster next time.
- **Research briefs** — search → synthesize → deliver to your channel, on a cron.
- **Multi-agent builds** — `vanta fleet` / `vanta swarm` fan independent tasks into isolated worktrees, then review + merge.
- **Long unattended runs** — hand it a multi-step task and walk away; it finishes **verified** or stops honestly (no silent hangs — *measured*, see [`docs/reliability-results.md`](docs/reliability-results.md)).
- **Reach you anywhere** — one gateway, 20 messaging adapters (Telegram + ntfy live-verified; the rest need their platform credentials and any required webhook endpoint).

## Troubleshooting

- **`vanta doctor` says no provider** → run `vanta setup` and pick a backend (Ollama for free/local, or paste an API key).
- **Local model "not responding"** → make sure Ollama is running (`ollama serve`) and the model is pulled (`ollama pull qwen2.5:14b`).
- **Kernel won't bind / "port 7788 in use"** → a stale kernel from a prior build: `lsof -nP -iTCP:7788 -sTCP:LISTEN`, kill the PID, re-run.
- **macOS blocks the downloaded kernel** ("cannot be opened") → clear the Gatekeeper quarantine: `xattr -dr com.apple.quarantine ~/vanta` (or build from source: `cargo build`).
- **Messaging / email / voice "didn't send"** → those *route* correctly but need the platform's credential (e.g. a Telegram bot token from @BotFather). The agent works fully with just a model backend; add tokens later in `vanta-ts/.env`.

## What works now

**Kernel (Rust):** enforced risk classifier (allow/ask/block), approval queue, goal ledger, event log, HTTP cockpit + JSON API, `VANTA_ROOT` scoping.

**Agent (TypeScript):**
- Core loop: goal-inject → plan → assess → execute → verify; OpenAI/Ollama/Anthropic/Gemini/OpenRouter providers; 138 registered tools and 145 slash commands
- **Goals** — kernel goal ledger plus TS dependency graph (`/goal blocks`, `/goal blocked_by`, `vanta goals`)
- **Skills & memory** — learned `~/.vanta/skills`, `/skills audit` for local skill injection-scan findings, a configurable public registry client with quarantine/approval/update rollback, per-goal memory, curator, LLM context compression (git-versioned)
- **Web search** — keyless (DuckDuckGo/SearXNG) + keyed (Brave/SerpAPI/Exa/Firecrawl/Tavily/Parallel/xAI Grok grounded search) with domain scoping; `web_fetch` readable extraction routes large pages through a size-tiered summarize/chunk/synthesize pipeline (configurable aux model)
- **Governance & cost** — `vanta governance export` (auditable report of every gated action), versioned `.env` + `vanta config rollback`, persisted spend ledger via `/usage breakdown`
- **Browser & vision** — screenshot / navigate / extract / read / act (Playwright) + image/video understanding
- **Voice & terminal** — push-to-talk voice input (local whisper STT), live terminal capture (tmux-backed), Slack `#channel` autocomplete in the composer
- **Desktop control** — native screen control (screencapture → vision grounding → cliclick, or the CHICAGO computer-use MCP); `vanta control setup` grants OS permissions
- **Ambient companion** — native Electron menu-bar presence with Quick Ask and approval status; `vanta desktop --companion` exposes a token-paired mobile status/chat/approval surface while terminal, files, tools, and model settings remain loopback-only
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
- **Reliable, not just capable** — the bar is finishing real multi-step tasks unattended and reporting only verified output (no hangs, recovers from tool errors, keeps the goal), **measured** by a tracked reliability eval (`scripts/reliability-eval.sh` → `docs/reliability-results.md`) that found and fixed real bugs. Feature count is table stakes, not the bar.
- **Goal-aware** — a goal ledger + dependency graph mean Vanta knows the goal before it picks a tool.
- **ND-first** — executive-function support baked in: task initiation (smallest next step), choice reduction (top 3), working-memory re-anchoring, closure gates, time-blindness ranges, low-sensory output.
- **Learns you, locally** — `vanta tune lora` trains a local adapter from your own accept/reject decisions; nothing leaves the machine.
- **20 messaging channels** from one gateway (Telegram, Slack, Discord, Signal, WhatsApp, iMessage, Teams, Email, Nostr…) — Telegram + ntfy live-verified end-to-end; the rest offline-tested and require platform credentials plus any channel-specific webhook setup.
- **Any model, any host** — provider-agnostic (any OpenAI-compatible endpoint + Azure/OpenRouter/Ollama); runs local / sandbox / Docker / SSH / $5 VPS, kernel-scoped everywhere.
- **MIT + self-hosted** — your data residency, no vendor lock-in.

More → **[Why Vanta](https://docs.vanta.theft.studio/why-vanta)**.

## Coming from OpenClaw or Hermes?

`vanta migrate <openclaw|hermes>` imports your existing agent's **skills, MCP servers, and model config** into `~/.vanta` — preview → pick → backup-first → apply, every step kernel-gated and reversible:

```bash
vanta migrate hermes        # or: openclaw   (--skills/--mcp/--model to narrow; --yes to take all)
```

It reads the other agent's `skills/<slug>/SKILL.md`, `mcpServers` config, and provider/model settings, **flags secret env keys without copying the secret**, and only writes after you confirm — your `~/.vanta` is backed up first.

Recent Hermes transcript mining added a focused parity path to the roadmap: persistent specialist profiles, profile-routed Kanban, transcript/notes corpus memory, delegation receipts, webhook workflow templates, automation blueprints, spreadsheet control, vault-backed secrets, and bounded dashboard plugin slots. The automation catalog now ships through `vanta automation blueprints` and `/blueprint`; see [`docs/automation-blueprints.md`](docs/automation-blueprints.md). The executable source of truth remains `roadmap.json`.

Same-provider credential pools are managed with `vanta auth pool`; they lease environment, Keychain, Bitwarden, 1Password, or vault references without persisting values, rotate on credential failures, and exhaust before cross-provider fallback. See [`docs/credential-pools.md`](docs/credential-pools.md).

Gateway runs can deliver recent in-scope reports, charts, spreadsheets, decks, HTML, and text files as native channel attachments while removing local paths from visible copy. See [`docs/deliverable-attachments.md`](docs/deliverable-attachments.md).

Public skill registries are opt-in through `VANTA_SKILL_REGISTRY`. Vanta previews and verifies complete skill packages before a disabled quarantine install, requires separate approval, preserves local edits during updates, supports confirmed version rollback, and removes reversibly. See [`docs/public-skill-registry.md`](docs/public-skill-registry.md).

Multi-source discovery supports official registries, skills.sh, well-known endpoints, direct URLs, curated GitHub sources, and removable GitHub taps. Discovery retains provenance and explicit cache/integrity state; every install still routes through quarantine. See [`docs/multi-source-skill-hub.md`](docs/multi-source-skill-hub.md).

Agent-authored skill changes can be staged with `vanta skills approval on`. Create/edit/patch/supporting-file/delete proposals survive restarts and require diff review before activation. See [`docs/skill-write-approval.md`](docs/skill-write-approval.md).

The current Hermes catalog comparison, including Stripe/payment, video/media, commerce, telephony, and finance packs, is tracked in [`docs/research/hermes-skill-catalog-gap-audit-2026-07-11.md`](docs/research/hermes-skill-catalog-gap-audit-2026-07-11.md). The roadmap orders package safety and discovery before high-side-effect outcome packs.

Test-only payment contracts now enforce exact totals, purchase/period caps, expiry, replay protection, non-cacheable operator approval, provider approval, HTTP 402 validation, and mode-0600 redacted receipts. Real-money Link execution, live MPP, and Stripe Projects remain disabled pending live acceptance receipts. See [`docs/payment-transactions.md`](docs/payment-transactions.md).

Persistent specialist profiles are now available through `vanta profiles`. Each profile has
an isolated Vanta home for its model/settings, skills, memory, gateway identity/state,
inbox, and work history. Create and target one by name, then switch on the next start:

```bash
vanta profiles create "Research Lead" --provider codex --model gpt-5.5
vanta profiles target research-lead "Audit provider fallback"
vanta profiles switch research-lead
vanta home
```

See the [profiles guide](vanta-website/docs/profiles.md) for clone, inbox, and archive behavior.
Whole specialists can also be previewed and installed from a local or Git distribution:

```bash
vanta profile install ./research-profile
vanta profile install ./research-profile --apply
vanta profile update research-lead --apply
```

Distribution installs copy declared capability/default files only. Secret files, credentials,
sessions, memory, inboxes, work history, and other private state are refused.

Notes, downloaded transcripts, and text documents can now be compiled into a durable,
source-indexed corpus under `~/.vanta/corpus`:

```bash
vanta corpus ingest ./research
vanta corpus recall "What did Caroline decide about Atlas?"
vanta corpus status
vanta corpus refresh all
vanta corpus vault-export --vault ~/Documents/Notes       # preview
vanta corpus vault-export --vault ~/Documents/Notes --apply
```

Recall fuses BM25 keyword rank, optional Ollama embeddings, and entity links. Every hit
prints its original source, source date, and freshness. When embeddings are unavailable,
the signal line says so by omitting `semantic`; it does not present lexical fallback as
semantic retrieval. URL ingest passes through the public-URL/egress guard before fetch.

Community-job proof is versioned separately from feature claims. The Hermes-derived
manifest has two scenarios in each of 15 categories and keeps live credentials gated:

```bash
node scripts/usecase-eval.mjs --validate
node scripts/usecase-eval.mjs --category Research
node scripts/usecase-eval.mjs --status --json
```

Executed runs write redacted local receipts. Deterministic contracts can verify reviewed
outputs; unexecuted scenarios remain explicit gaps in the public aggregate proof.

Scenarios that need operator choices can add `firstTurn` and ordered `operatorReplies`.
The use-case runner then keeps one Vanta conversation alive, waits for each turn to finish,
and records redacted per-turn boundary, tool, and guard evidence. The lower-level command is:

```bash
vanta story-eval --manifest eval/use-cases/hermes-community-v1.json \
  --id dev-converse-before-act --out .vanta/eval-runs/story.json
```

Persistent profiles can own routed Kanban cards. Cards declare skills, dependencies, wake
policy, evidence, and fallback; Vanta can select a capable profile and preserve handoffs:

```bash
vanta kanban add research "Research sources" --instruction "Find evidence" --skills research --wake immediate
vanta kanban route research
vanta kanban update research done --evidence receipts/research.json
```

Profiles can also declare a small role-specific tool surface. The allowlist is enforced for
built-in, MCP, and plugin tools; failed calls reuse the same repair explanation:

```bash
vanta profiles tools research-lead --allow read_file,grep_files,web_search,ref_search
vanta tools why gmail_send
```

Delegated workers return compact summaries to the parent while retaining an inspectable
evidence tree and raw sidechain:

```bash
vanta agents delegations
vanta agents delegations <tree-id>
vanta agents delegation replay <child-id>
vanta agents delegation follow-up <child-id> "check the remaining risk"
```

Each child node records its prompt, model, tools, summary, verification result, sidechain
path, elapsed time, token usage, estimated cost, and tracked replay/follow-up controls.
`vanta lifesearch` searches the bounded raw sidechain source.

## Community

- 💬 **[Discussions](https://github.com/jpoindexter/Vanta/discussions)** — questions, ideas, show-and-tell.
- 🐛 **[Issues](https://github.com/jpoindexter/Vanta/issues)** — bugs + feature requests (templates provided).
- 📚 **[Docs](https://docs.vanta.theft.studio)** — the full guide.
- 📦 **[Releases](https://github.com/jpoindexter/Vanta/releases)** — prebuilt kernels for macOS arm64/x64, Linux GNU arm64/x64, Windows x64, and Android/Termux arm64.

## Related

- **[obsidian-vault-mcp](https://github.com/jpoindexter/obsidian-vault-mcp)** — MCP server that gives Vanta (or any MCP client) a self-improving Obsidian knowledge base. 10 tools: read, keyword + semantic search, full self-ingest, hot cache. Zero dependencies, local ollama embeddings.

## Rule zero

Do no harm. No deletes, no overwrites, no touching outside authorized scope without explicit approval. The Rust kernel enforces this on every tool call — it is a gate, not a suggestion.

Full threat model + the 2026-06-20 pentest (findings & fixes): **[Security](https://docs.vanta.theft.studio/security)** · report a vulnerability privately via [SECURITY.md](SECURITY.md).

## Contributing

Issues and PRs welcome — see **[CONTRIBUTING.md](CONTRIBUTING.md)** for setup, the code standards (size gate, ESM, zod boundaries), and how to run the suite. We follow a [Code of Conduct](CODE_OF_CONDUCT.md). Found a vulnerability? See [SECURITY.md](SECURITY.md) — please report privately, not in a public issue.

## License

[MIT](LICENSE) © Jason Poindexter.
